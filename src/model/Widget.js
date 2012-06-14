var promises = require('q');

var Hook = require('./Hook');


/**@class A Widget models a set of controls on a website.
*/
var Widget = new Class({
	/** The name of this widget.
	* Automatically set to the name of its containing file upon parsing.
	*@type	{String}
	*/
	name: '',
	
	/**
	*@param	name	Name of this widget.
	*@param	values	A hash with the following form:
	*	`elements`: a hash mapping attribute names to a hook. A hook is a one-pair hash mapping a selector type to an actual selector.
	*	a series of methods definitions, i.e. `name: function name(…) { … }`, that will be made available
	*@param	driver	The WebDriver instance in which this widget should look for its elements.
	*/
	initialize: function init(name, values, driver) {
		this.name = name;
		
		var widget = this;
		
		Object.each(values.elements, function(typeAndSelector, key) {
			Hook.addHook(widget, key, typeAndSelector, driver);
		});
		
		delete values.elements;
		
		Object.each(values, function(method, key) {
			widget[key] = function() {
				if (VERBOSE)
					console.log('	- did ' + key + ' ' + Array.prototype.slice.call(arguments).join(', '));
				method.apply(widget, arguments); //TODO: handle elements overloading
			}
		});
		
		this.has = this.has.bind(this);
	},
	
	/** Checks that the given element is found on the page.
	*
	*@param	{String}	attribute	The name of the element whose presence is to be checked.
	*@returns	{boolean}	Whether the element was found or not.
	*/
	has: function has(attribute) {
		var deferred = promises.defer();
	
		try {
			this[attribute].then(function() {
					if (VERBOSE)
						console.log('	- checked presence of ' + attribute);
	
					deferred.resolve();;
				},
				deferred.reject.bind(deferred, 'Missing element ' + attribute)
			);
		} catch (error) {
			deferred.reject('Error while trying to check presence of element "' + attribute + '"');
		}
		
		return deferred.promise;
	}
});

module.exports = Widget;	// CommonJS export
