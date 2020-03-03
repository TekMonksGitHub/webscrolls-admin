/* 
 * (C) 2020 TekMonks. All rights reserved.
 */
const path = require("path");
const API_CONSTANTS = require(`${__dirname}/lib/constants.js`);
const CONF = require(`${API_CONSTANTS.CONF_DIR}/wsadmin.json`);
const util = require("util");
const fs = require("fs");
const readdirAsync = util.promisify(fs.readdir);
const rmdirAsync = util.promisify(fs.rmdir);
const unlinkAsync = util.promisify(fs.unlink);
const statAsync = util.promisify(fs.stat);

exports.doService = async jsonReq => {
	if (!validateRequest(jsonReq)) {LOG.error("Validation failure."); return CONSTANTS.FALSE_RESULT;}
	
	LOG.debug("Got deletefile request for path: " + jsonReq.path);

	const fullpath = path.resolve(`${CONF.CMS_ROOT}/${jsonReq.path}`);
	if (!API_CONSTANTS.isSubdirectory(fullpath, CONF.CMS_ROOT)) {LOG.error(`Subdir validation failure: ${jsonReq.path}`); return CONSTANTS.FALSE_RESULT;}

	try {
        await rmrf(fullpath); return CONSTANTS.TRUE_RESULT;
	} catch (err) {LOG.error(`Error deleting  path: ${fullpath}, error is: ${err}`); return CONSTANTS.FALSE_RESULT;}
}

async function rmrf(path) {
	if ((await statAsync(path)).isFile()) {await unlinkAsync(path); return;}

	const entries = await readdirAsync(path);
	for (const entry of entries) {
		const stats = await statAsync(`${path}/${entry}`);
		if (stats.isFile()) await unlinkAsync(`${path}/${entry}`); else if (stats.isDirectory()) await rmrf(`${path}/${entry}`);
	}
	await rmdirAsync(path);
}

const validateRequest = jsonReq => (jsonReq && jsonReq.path);
