/* 
 * (C) 2020 TekMonks. All rights reserved.
 */
const path = require("path");
const util = require("util");
const crypto = require("crypto");
const sqlite3 = require("sqlite3");
const CONF = require(`${API_CONSTANTS.CONF_DIR}/wsadmin.json`);
let wsadminDB;

function _initDB() {
	return new Promise((resolve, reject) => {
		if (!wsadminDB) wsadminDB = new sqlite3.Database(API_CONSTANTS.APP_DB, sqlite3.OPEN_READWRITE, err => {
			if (!err) resolve(); else reject(err);
		}); else resolve();
	});
}

exports.doService = async jsonReq => {
	if (!validateRequest(jsonReq)) {LOG.error("Validation failure."); return CONSTANTS.FALSE_RESULT;}
	
	LOG.debug("Got share file request for path: " + jsonReq.path);

	const fullpath = path.resolve(`${CONF.CMS_ROOT}/${jsonReq.path}`);
	if (!API_CONSTANTS.isSubdirectory(fullpath, CONF.CMS_ROOT)) {LOG.error(`Subdir validation failure: ${jsonReq.path}`); return CONSTANTS.FALSE_RESULT;}

	try {
		await _initDB(); const expiry = Date.now()+(jsonReq.expiry||CONF.SHARE_EXPIRY);	// default expiry is 2 days
		const id = crypto.createHash("sha512").update(fullpath+expiry+(Math.random()*(1000000 - 1)+1)).digest("hex");
		await (util.promisify(wsadminDB.run.bind(wsadminDB))("INSERT INTO shares(fullpath, id, expiry) VALUES (?,?,?)", [fullpath,id,expiry]));
        return {result: true, id};
	} catch (err) {LOG.error(`Error sharing  path: ${fullpath}, error is: ${err}`); return CONSTANTS.FALSE_RESULT;}
}

const validateRequest = jsonReq => (jsonReq && jsonReq.path);
