/* 
 * (C) 2020 TekMonks. All rights reserved.
 */
const util = require("util");
const path = require("path");
const sqlite3 = require("sqlite3");
const CONF = require(`${API_CONSTANTS.CONF_DIR}/wsadmin.json`);
const downloadfile = require(`${API_CONSTANTS.API_DIR}/downloadfile.js`);

let wsadminDB;

function _initDB() {
	return new Promise((resolve, reject) => {
		if (!wsadminDB) wsadminDB = new sqlite3.Database(API_CONSTANTS.APP_DB, sqlite3.OPEN_READWRITE, err => {
			if (!err) resolve(); else reject(err);
		}); else resolve();
	});
}

exports.handleRawRequest = async (url, jsonReq, headers, servObject) => {
	if (!validateRequest(jsonReq)) {LOG.error("Validation failure."); return CONSTANTS.FALSE_RESULT;}
	
	LOG.debug("Got download shared file request for id: " + jsonReq.id);

	try {
		await _initDB(); 
		const share = await (util.promisify(wsadminDB.get.bind(wsadminDB))("SELECT fullpath, expiry FROM shares WHERE id = ?", [jsonReq.id]));
        
        if (!share) throw ({code: 404, message: "Not found"}); 
        if (Date.now() > share.expiry) throw ({code: 404, message: "Not found"});   // has expired
        
        const relativepath = share.fullpath.substring(path.resolve(`${CONF.CMS_ROOT}/`).length);
        return downloadfile.handleRawRequest(url, {path: relativepath}, headers, servObject);
	} catch (err) {
        LOG.error(`Share ID resulted in DB error ${err}`); 
        throw ({code: 404, message: "Not found"}); 
    }
}

const validateRequest = jsonReq => (jsonReq && jsonReq.id);
