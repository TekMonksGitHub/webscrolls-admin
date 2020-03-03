/* 
 * (C) 2020 TekMonks. All rights reserved.
 */
const path = require("path");
const API_CONSTANTS = require(`${__dirname}/lib/constants.js`);
const CONF = require(`${API_CONSTANTS.CONF_DIR}/wsadmin.json`);
const util = require("util");
const fs = require("fs");
const renameAsync = util.promisify(fs.rename);

exports.doService = async jsonReq => {
	if (!validateRequest(jsonReq)) {LOG.error("Validation failure."); return CONSTANTS.FALSE_RESULT;}
	
	LOG.debug("Got renamefile request for path: " + jsonReq.old);

	const oldPath = path.resolve(`${CONF.CMS_ROOT}/${jsonReq.old}`); const newPath = path.resolve(`${CONF.CMS_ROOT}/${jsonReq.new}`);
	if (!API_CONSTANTS.isSubdirectory(oldPath, CONF.CMS_ROOT)) {LOG.error(`Subdir validation failure: ${jsonReq.old}`); return CONSTANTS.FALSE_RESULT;}

	try {
		renameAsync(oldPath, newPath);
        return CONSTANTS.TRUE_RESULT;
	} catch (err) {LOG.error(`Error renaming  path: ${oldPath}, error is: ${err}`); return CONSTANTS.FALSE_RESULT;}
}

const validateRequest = jsonReq => (jsonReq && jsonReq.old && jsonReq.new);
