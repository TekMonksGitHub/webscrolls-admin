/* 
 * (C) 2020 TekMonks. All rights reserved.
 */
const path = require("path");
const API_CONSTANTS = require(`${__dirname}/lib/constants.js`);
const CONF = require(`${API_CONSTANTS.CONF_DIR}/wsadmin.json`);
const util = require("util");
const fs = require("fs");
const mkdirAsync = util.promisify(fs.mkdir);
const appendFileAsync = util.promisify(fs.appendFile);

exports.doService = async jsonReq => {
	if (!validateRequest(jsonReq)) {LOG.error("Validation failure."); return CONSTANTS.FALSE_RESULT;}
	
	LOG.debug("Got createfile request for path: " + jsonReq.path);

	const fullpath = path.resolve(`${CONF.CMS_ROOT}/${jsonReq.path}`);
	if (!API_CONSTANTS.isSubdirectory(fullpath, CONF.CMS_ROOT)) {LOG.error(`Subdir validation failure: ${jsonReq.path}`); return CONSTANTS.FALSE_RESULT;}

	try {

		if (jsonReq.isDirectory && jsonReq.isDirectory != "false") await mkdirAsync(fullpath);
		else await appendFileAsync(fullpath, '');

        return CONSTANTS.TRUE_RESULT;
	} catch (err) {LOG.error(`Error creating  path: ${fullpath}, error is: ${err}`); return CONSTANTS.FALSE_RESULT;}
}

const validateRequest = jsonReq => (jsonReq && jsonReq.path);
