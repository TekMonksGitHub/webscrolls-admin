/* 
 * (C) 2020 TekMonks. All rights reserved.
 */
const fs = require("fs");
const path = require("path");
const archiver = require("archiver");
const utils = require(`${CONSTANTS.LIBDIR}/utils.js`);
const statsAsync = require("util").promisify(fs.stat);
const CONF = require(`${API_CONSTANTS.CONF_DIR}/wsadmin.json`);

exports.handleRawRequest = async (url, jsonReq, headers, servObject) => {
	if (!validateRequest(jsonReq)) {LOG.error("Validation failure."); return CONSTANTS.FALSE_RESULT;}
	
	LOG.debug("Got downloadfile request for path: " + jsonReq.path);

	const fullpath = path.resolve(`${CONF.CMS_ROOT}/${jsonReq.path}`);
	if (!API_CONSTANTS.isSubdirectory(fullpath, CONF.CMS_ROOT)) {LOG.error(`Subdir validation failure: ${jsonReq.path}`); return CONSTANTS.FALSE_RESULT;}

	try {
        const stats = await statsAsync(fullpath); if (stats.isDirectory()) fullpath = await _zipDirectory(fullpath);

		let respHeaders = {}; APIREGISTRY.injectResponseHeaders(url, {}, headers, respHeaders, servObject);
		respHeaders["content-disposition"] = "attachment;filename=" + path.basename(fullpath);
		respHeaders["content-length"] = stats.size;   
		respHeaders["content-type"] = "application/octet-stream";	// try and add auto GZIP here to save bandwidth
		servObject.server.statusOK(respHeaders, servObject, true);

        fs.createReadStream(fullpath, {"flags":"r","autoClose":true}).pipe(servObject.res, {end:true});
	} catch (err) {
		LOG.error(`Error in downloadfile: ${err}`);
		if (!servObject.res.writableEnded) {servObject.server.statusInternalError(servObject, err); servObject.server.end(servObject);}
	}
}

async function _zipDirectory(path) {
    return new Promise((resolve, reject) => {
        const tempFilePath = utils.getTempFile("zip"); const out = fs.createWriteStream(tempFilePath);
        const arhiver = archiver("zip", { zlib: { level: 9 }});
        archiver.on("end", _=>resolve(tempFilePath)); archiver.on("error", err=>reject(err));
        arhiver.directory(path, false).pipe(out, {end:true}); archive.finalize();
    });
}

const validateRequest = jsonReq => (jsonReq && jsonReq.path);
