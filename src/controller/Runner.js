var url = require('url');


var webdriver	= require('wd'),
	promises	= require('q');


var Runner = new Class( /** @lends Runner# */ {

	Extends: require('events').EventEmitter,

	/** The promise object for results, resolved when all features of this Runner have been evaluated.
	*@type	{Promise}
	*/
	promise: null,

	/** A hash mapping all failed features to their reasons for rejection.
	*If empty, the run was successful.
	*@type	{Object.<Feature, String>}
	*@private
	*/
	failures: Object.create(null),

	/** The list of all features to evaluate with this configuration.
	*@type	{Array.<Feature>}
	*@private
	*/
	features: [],

	/** Index of the currently evaluated feature.
	*@type	{integer}
	*@private
	*/
	currentFeature: 0,

	/** Promise for the driver to be initialized.
	*
	*@type	{Promise}
	*@private
	*/
	initialized: null,

	/** Promise for the baseURL to be loaded.
	*
	*@type	{Promise}
	*@private
	*/
	baseUrlLoaded: null,

	/** The promise controller (deferred object) for results, resolved when all features of this Runner have been evaluated.
	*@type	{q.deferred}
	*@private
	*/
	deferred: null,


	/**@class	Manages a set of features and the driver in which they are run.
	*
	* A `Runner` is mostly set up through a configuration object.
	* Such an object MUST contain the following items:
	*	- `baseURL`: the URL at which the driver should start;
	* It SHOULD contain:
	*	- `driverCapabilities`: an object that will be passed straight to the WebDriver instance, that describes the browser on which the tests should be run.
	* It MAY contain:
	*	- `name`: the name of the suite. Defaults to the name of the containing folder.
	*
	*@constructs
	*@param	{Object}	config	A configuration object, as defined above.
	*/
	initialize: function init(config) {
		this.parseConfig(config);

		this.initDriver();
	},

	/** Checks the passed configuration hash for any missing mandatory definitions.
	*
	*@param	{Object}	config	The configuration object to check (may not be defined, which will return an error).
	*@return	{Error|null}	An error object describing the encountered problem, or `null` if no error was found.
	*@see	#initialize	For details on the configuration object.
	*/
	parseConfig: function parseConfig(config) {
		if (! config)
			throw new Error('You need to provide a configuration to create a Runner!');

		try {
			config.seleniumServerURL = url.format(config.seleniumServerURL);
		} catch (err) {
			throw new Error('The given Selenium server URL ("' + config.seleniumServerURL + '") is unreadable (' + err.message + ')');
		}

		try {
			config.baseURL = url.format(config.baseURL);	// allow taking objects describing the URL
		} catch (err) {
			throw new Error('The given base URL ("' + config.baseURL + '") is unreadable (' + err.message + ')');
		}

		this.config = config;
	},

	/** Initializes the underlying driver of this Runner.
	* Emits "driverInit".
	*
	*@return	{Promise}	A promise for the driver to be initialized.
	*@private
	*/
	initDriver: function initDriver() {
		if (! this.driver) {
			this.emit('driverInit', this);
			this.initialized = this.buildDriverFrom(this.config);
		}

		return this.initialized;
	},

	/** Navigates to the base page for this runner.
	*
	*@return	{Promise}	A promise for the base page to be loaded.
	*@private
	*/
	loadBaseURL: function loadBaseURL() {
		this.loaded = this.driver.get(this.config.baseURL);

		this.loaded.then(this.onReady.bind(this));

		return this.loaded;
	},

	/** Constructs a new WebDriver instance based on the given configuration.
	*
	*@param		{Object}	config	The configuration object based on which the driver will be built.
	*@return	{Promise}	The promise for the `driver` instance variable to be ready.
	*@see		#initialize	For details on the configuration object.
	*@private
	*/
	buildDriverFrom: function buildDriverFrom(config) {
		var seleniumServer = url.parse(config.seleniumServerURL);	// TODO: get the URL already parsed from the config instead of serializing it at each step

		this.driver = webdriver.promiseRemote({
			host		: seleniumServer.hostname,
			port		: seleniumServer.port,
			username	: (seleniumServer.auth ? seleniumServer.auth.split(':')[0] : undefined),	// TODO: this is a workaround WD's lack of `url.parse` compatibility. This code is to be refactored once <https://github.com/admc/wd/pull/141> is merged.
			accessKey	: (seleniumServer.auth ? seleniumServer.auth.split(':')[1] : undefined)
		});

		return this.driver.init(config.driverCapabilities);
	},

	/** Tells whether the underlying driver of this Runner has loaded the base page or not.
	*
	*@return	{Boolean}	`true` if the page has been loaded, `false` otherwise.
	*/
	isReady: function isReady() {
		return !! (this.loaded && this.loaded.isFulfilled());
	},

	/** Emits the "ready" event.
	*
	*@private
	*/
	onReady: function onReady() {
		this.emit('ready', this);
	},

	/** Adds the given Feature to the list of those that this Runner will evaluate.
	*
	*@param	{Feature}	feature	A Feature for this Runner to evaluate.
	*@return	This Runner, for chaining.
	*/
	addFeature: function addFeature(feature) {
		this.features.push(feature);

		return this;
	},

	/** Returns the WebDriver instance this Runner created for the current run.
	*
	*@returns	WebDriver
	*/
	getDriver: function getDriver() {
		return this.driver;
	},

	/** Evaluates all features added to this Runner.
	*
	*@returns	{Promise}	A promise for results, resolved if all features pass (param: this Runner), rejected otherwise (param: hash mapping failed features to their reasons for rejection, or an Error if an error appeared in the runner itself or the evaluation was cancelled).
	*@see	#addFeature
	*/
	test: function test() {
		this.deferred = promises.defer();
		this.promise = this.deferred.promise;

		this.initDriver()
			.then(this.loadBaseURL.bind(this))
			.then(this.start.bind(this));

		return this.promise;
	},

	/** Actually starts the evaluation process.
	* Emits "start".
	*
	*@private
	*/
	start: function start() {
		this.failures = Object.create(null);
		this.currentFeature = -1;

		this.emit('start', this);

		this.startNextFeature();
	},

	/** Increments the feature index, starts evaluation of the next feature, and quits the driver if all features were evaluated.
	*
	*@private
	*/
	startNextFeature: function startNextFeature() {
		this.currentFeature++;

		if (this.currentFeature < this.features.length)
			this.evaluateFeature(this.features[this.currentFeature]);
		else
			this.finish();
	},

	/** Prepares and triggers the evaluation of the given feature.
	* Emits "feature".
	*
	*@private
	*/
	evaluateFeature: function evaluateFeature(feature) {
		this.emit('feature', feature);

		feature.test().then(this.startNextFeature.bind(this),
							this.handleFeatureFailure.bind(this, feature)); // leave last arg to pass failure description
	},

	/** Callback handler upon feature evaluation. Flags failures and calls the `startNextFeature` handler.
	*
	*@private
	*@see	#startNextFeature
	*/
	handleFeatureFailure: function handleFeatureFailure(feature, message) {
		this.failures[feature] = message;
		this.failed = true;

		this.startNextFeature();
	},

	/** Informs of the end result and cleans the instance up after tests runs.
	*
	*@private
	*/
	finish: function finish() {
		var resolve			= this.deferred.resolve.bind(this.deferred, this),
			reject			= this.deferred.reject.bind(this.deferred, this.failures),
			fulfill			= resolve,
			killDriver		= this.killDriver.bind(this),
			precondition	= (this.config.quit == 'always'
								? killDriver
								: promises);

		if (Object.getLength(this.failures) > 0) {
			fulfill = reject;
		} else {
			if (this.config.quit == 'on success')
				precondition = killDriver;
		}

		precondition().then(fulfill, reject);
	},

	/** Quits the managed browser.
	*
	*@return	{Promise}	A promise resolved once the browser has been properly quit.
	*/
	killDriver: function killDriver() {
		var driver = this.driver;
		this.driver = null;	// delete reference, as it won't be usable once quitted

		return (driver	// multiple calls to killDriver() might be issued
				? this.initialized.then(function() { return driver.quit() })
				: promises());	// normalize return type to a promise, so that it can safely be called even if the driver had already been quit
	},

	toString: function toString() {
		return this.config.name;
	}
});

module.exports = Runner;	// CommonJS export
