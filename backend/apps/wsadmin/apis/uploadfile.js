/* 
 * (C) 2020 TekMonks. All rights reserved.
 */
const path = require("path");
const API_CONSTANTS = require(`${__dirname}/lib/constants.js`);
const CONF = require(`${API_CONSTANTS.CONF_DIR}/wsadmin.json`);
const util = require("util");
const fs = require("fs");
const appendFileAsync = util.promisify(fs.appendFile);

exports.doService = async jsonReq => {
	if (!validateRequest(jsonReq)) {LOG.error("Validation failure."); return CONSTANTS.FALSE_RESULT;}
	
	LOG.debug("Got uploadfile request for path: " + jsonReq.path);

	const fullpath = path.resolve(`${CONF.CMS_ROOT}/${jsonReq.path}`);
	if (!API_CONSTANTS.isSubdirectory(fullpath, CONF.CMS_ROOT)) {LOG.error(`Subdir validation failure: ${jsonReq.path}`); return CONSTANTS.FALSE_RESULT;}

	try {
        const matches = jsonReq.data.match(/^data:.*;base64,(.*)$/); 
        if (!matches) throw `Bad data encoding: ${jsonReq.data}`;

        await appendFileAsync(fullpath, Buffer.from(matches[1], "base64")); 
        return CONSTANTS.TRUE_RESULT;
	} catch (err) {LOG.error(`Error writing to path: ${fullpath}, error is: ${err}`); return CONSTANTS.FALSE_RESULT;}
}

const validateRequest = jsonReq => (jsonReq && jsonReq.path && jsonReq.data);
