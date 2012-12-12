/** Prints CLI synopsis.
*
*@param	{Number|false}	[exitCode]	The exit code with which the process should exit. Pass `false` to not exit. Defaults to exiting with status code 0.
*/
function showHelp(exitCode) {
	console.log("Usage: watai path/to/suite/description/folder [another/suite [yetAnother […]]]");

	if (typeof exitCode == 'number')
		process.exit(exitCode);
}


module.exports = showHelp;	// CommonJS export
