/* 
 * (C) 2020 TekMonks. All rights reserved.
 * License: MIT - see enclosed license.txt file.
 */
import {i18n} from "/framework/js/i18n.mjs";
import {util} from "/framework/js/util.mjs";
import {router} from "/framework/js/router.mjs";
import {session} from "/framework/js/session.mjs";
import {apimanager as apiman} from "/framework/js/apimanager.mjs";
import {monkshu_component} from "/framework/js/monkshu_component.mjs";

let mouseX, mouseY, menuOpen, timer, selectedPath, selectedIsDirectory, selectedElement, filesAndPercents, selectedCut, selectedCopy;

const DIALOG_HIDE_WAIT = 1300;

const API_GETFILES = APP_CONSTANTS.BACKEND+"/apps/"+APP_CONSTANTS.APP_NAME+"/getfiles";
const API_UPLOADFILE = APP_CONSTANTS.BACKEND+"/apps/"+APP_CONSTANTS.APP_NAME+"/uploadfile";
const API_DELETEFILE = APP_CONSTANTS.BACKEND+"/apps/"+APP_CONSTANTS.APP_NAME+"/deletefile";
const API_CREATEFILE = APP_CONSTANTS.BACKEND+"/apps/"+APP_CONSTANTS.APP_NAME+"/createfile";
const API_RENAMEFILE = APP_CONSTANTS.BACKEND+"/apps/"+APP_CONSTANTS.APP_NAME+"/renamefile";
const API_OPERATEFILE = APP_CONSTANTS.BACKEND+"/apps/"+APP_CONSTANTS.APP_NAME+"/operatefile";
const API_DOWNLOADFILE = APP_CONSTANTS.BACKEND+"/apps/"+APP_CONSTANTS.APP_NAME+"/downloadfile";
const API_COPYFILE = APP_CONSTANTS.BACKEND+"/apps/"+APP_CONSTANTS.APP_NAME+"/copyfile";

const DIALOG_HOST_ELEMENT_ID = "templateholder";

const IO_CHUNK_SIZE = 4096;   // 4K read buffer

async function elementConnected(element) {
   menuOpen = false; 

   const path = element.getAttribute("path") || "/"; selectedPath = path.replace(/[\/]+/g,"/"); selectedIsDirectory = true;
   let resp = await apiman.rest(API_GETFILES, "GET", {path}, true);
   if (!resp || !resp.result) return;
   
   // if a file or folder has been selected, show the paste button
   if (selectedCopy || selectedCut) resp.entries.unshift({name: await i18n.get("Paste", session.get($$.MONKSHU_CONSTANTS.LANG_ID)), path, stats:{paste: true}});

   resp.entries.unshift({name: await i18n.get("Create", session.get($$.MONKSHU_CONSTANTS.LANG_ID)), path, stats:{create: true}});
   resp.entries.unshift({name: await i18n.get("Upload", session.get($$.MONKSHU_CONSTANTS.LANG_ID)), path, stats:{upload: true}});

   if (!path.match(/^[\/]+$/g)) { // add in back and home buttons
      let parentPath = path.substring(0, path.lastIndexOf("/")); if (parentPath == "") parentPath = "/";
      resp.entries.unshift({name: await i18n.get("Back", session.get($$.MONKSHU_CONSTANTS.LANG_ID)), path:parentPath, stats:{back: true}});
      resp.entries.unshift({name: await i18n.get("Home", session.get($$.MONKSHU_CONSTANTS.LANG_ID)), path:"/", stats:{home: true}});
   }

   let data = {entries: resp.entries};

   if (element.getAttribute("styleBody")) data.styleBody = `<style>${element.getAttribute("styleBody")}</style>`;
   
   if (element.id) {
       if (!file_manager.datas) file_manager.datas = {}; file_manager.datas[element.id] = data;
   } else file_manager.data = data;
}

async function elementRendered(element) {
   document.addEventListener("mousemove", e => {mouseX = e.pageX; mouseY = e.pageY;});

   const container = file_manager.getShadowRootByHostId(element.getAttribute("id")).querySelector("div#container");
   document.addEventListener("click", _e => { if (!menuOpen) showMenu(container, true); else hideMenu(container); });
}

function handleClick(element, path, isDirectory) {
   selectedPath = path?path.replace(/[\/]+/g,"/"):selectedPath; 
   selectedIsDirectory = (isDirectory!== undefined) ? util.parseBoolean(isDirectory) : selectedIsDirectory;
   selectedElement = element;
   
   if (timer) {clearTimeout(timer); editFile(element); timer=null;}
   else timer = setTimeout(_=> {timer=null;showMenu(element)}, 400);
}

function upload(containedElement) {
   filesAndPercents = {};  // reset progress indicator bucket
   file_manager.getShadowRootByContainedElement(containedElement).querySelector("input#upload").click();
}

function create(containedElement) {
   showDialog(containedElement, "createfiledialog");
}

const uploadFiles = async (element, files) => {for (const file of files) await uploadAFile(element, file)}

async function uploadAFile(element, file) {
   const totalChunks = Math.ceil(file.size / IO_CHUNK_SIZE); const lastChunkSize = file.size - (totalChunks-1)*IO_CHUNK_SIZE;
   const waitingReaders = [];

   const queueReadFileChunk = (fileToRead, chunkNumber, resolve, reject) => {
      const reader = new FileReader();
      const onloadFunction = async loadResult => {
         const resp = await apiman.rest(API_UPLOADFILE, "POST", {data:loadResult.target.result, path:`${selectedPath}/${fileToRead.name}`}, true);
         if (!resp.result) reject(); else {
            resolve(); 
            showProgress(element, chunkNumber+1, totalChunks, fileToRead.name);
            if (waitingReaders.length) (waitingReaders.pop())();  // issue next chunk read if queued reads
         }
      }
      reader.onload = onloadFunction;
      reader.onerror = _loadResult => {waitingOnRead = false; reject();}
      const sizeToRead = chunkNumber == totalChunks-1 ? lastChunkSize : IO_CHUNK_SIZE;
      // queue reads if we are waiting for a chunk to be returned, so the writes are in correct order 
      waitingReaders.unshift(_=>{reader.readAsDataURL(fileToRead.slice(IO_CHUNK_SIZE*chunkNumber, IO_CHUNK_SIZE*chunkNumber+sizeToRead));});
   }

   const startReaders = _ => {if (waitingReaders.length) (waitingReaders.pop())()}

   let readPromises = []; 
   for (let i = 0; i < totalChunks; i++) readPromises.push(new Promise((resolve, reject) => queueReadFileChunk(file, i, resolve, reject)));
   startReaders();   // kicks off the first read in the queue, which then fires others 
   return Promise.all(readPromises);
}

function showMenu(element, documentMenuOnly) {
   const shadowRoot = file_manager.getShadowRootByContainedElement(element);

   if (documentMenuOnly) {
      shadowRoot.querySelector("div#contextmenu > span#upload").classList.remove("hidden");
      shadowRoot.querySelector("div#contextmenu > span#create").classList.remove("hidden");
      if (selectedCopy || selectedCut) shadowRoot.querySelector("div#contextmenu > span#paste").classList.remove("hidden"); 
      else shadowRoot.querySelector("div#contextmenu > span#paste").classList.add("hidden"); 
      shadowRoot.querySelector("div#contextmenu > span#edit").classList.add("hidden"); 
      shadowRoot.querySelector("div#contextmenu > span#hr1").classList.add("hidden"); 
      shadowRoot.querySelector("div#contextmenu > span#renamefile").classList.add("hidden");
      shadowRoot.querySelector("div#contextmenu > span#deletefile").classList.add("hidden"); 
      shadowRoot.querySelector("div#contextmenu > span#downloadfile").classList.add("hidden");  
      shadowRoot.querySelector("div#contextmenu > span#hr2").classList.add("hidden"); 
      shadowRoot.querySelector("div#contextmenu > span#cut").classList.add("hidden"); 
      shadowRoot.querySelector("div#contextmenu > span#copy").classList.add("hidden"); 
   } else if (element.getAttribute("id") && (element.getAttribute("id") == "home" || element.getAttribute("id") == "back" || element.getAttribute("id") == "upload" || element.getAttribute("id") == "create" || element.getAttribute("id") == "paste")) {
      shadowRoot.querySelector("div#contextmenu > span#upload").classList.add("hidden");
      shadowRoot.querySelector("div#contextmenu > span#create").classList.add("hidden");
      shadowRoot.querySelector("div#contextmenu > span#hr1").classList.add("hidden"); 
      shadowRoot.querySelector("div#contextmenu > span#renamefile").classList.add("hidden");
      shadowRoot.querySelector("div#contextmenu > span#deletefile").classList.add("hidden"); 
      shadowRoot.querySelector("div#contextmenu > span#downloadfile").classList.add("hidden");  
      shadowRoot.querySelector("div#contextmenu > span#hr2").classList.add("hidden"); 
      shadowRoot.querySelector("div#contextmenu > span#cut").classList.add("hidden"); 
      shadowRoot.querySelector("div#contextmenu > span#copy").classList.add("hidden"); 
      shadowRoot.querySelector("div#contextmenu > span#paste").classList.add("hidden"); 
      shadowRoot.querySelector("div#contextmenu > span#edit").classList.remove("hidden");
   } else {
      shadowRoot.querySelector("div#contextmenu > span#edit").classList.remove("hidden");
      shadowRoot.querySelector("div#contextmenu > span#hr1").classList.remove("hidden"); 
      shadowRoot.querySelector("div#contextmenu > span#renamefile").classList.remove("hidden");
      shadowRoot.querySelector("div#contextmenu > span#deletefile").classList.remove("hidden"); 
      shadowRoot.querySelector("div#contextmenu > span#downloadfile").classList.remove("hidden");  
      shadowRoot.querySelector("div#contextmenu > span#hr2").classList.remove("hidden"); 
      shadowRoot.querySelector("div#contextmenu > span#cut").classList.remove("hidden"); 
      shadowRoot.querySelector("div#contextmenu > span#copy").classList.remove("hidden"); 
      if (selectedCopy || selectedCut) shadowRoot.querySelector("div#contextmenu > span#paste").classList.remove("hidden"); 
      else shadowRoot.querySelector("div#contextmenu > span#paste").classList.add("hidden"); 
      shadowRoot.querySelector("div#contextmenu > span#upload").classList.add("hidden");
      shadowRoot.querySelector("div#contextmenu > span#create").classList.add("hidden");
   }

   const contextMenu = shadowRoot.querySelector("div#contextmenu");
   contextMenu.style.top = mouseY+"px"; contextMenu.style.left = mouseX+"px";
   contextMenu.classList.add("visible");   
   menuOpen = true;
}

function hideMenu(element) {
   const shadowRoot = file_manager.getShadowRootByContainedElement(element);
   const contextMenu = shadowRoot.querySelector("div#contextmenu");
   contextMenu.classList.remove("visible");   
   menuOpen = false;
}

function menuEventDispatcher(name, element) {
   hideMenu(element);
   file_manager[name](element);
}

async function deleteFile(element) {
   let resp = await apiman.rest(API_DELETEFILE, "GET", {path: selectedPath}, true);
   if (resp.result) router.reload(); else showErrorDialog(element);
}

function editFile(element) {
   if (selectedIsDirectory) {
      const urlToLoad = util.replaceURLParamValue(session.get($$.MONKSHU_CONSTANTS.PAGE_URL), "path", selectedPath);
      router.loadPage(urlToLoad);
      return;
   } 

   if (selectedElement.id == "upload") {upload(selectedElement); return;}

   if (selectedElement.id == "create") {create(selectedElement); return;}

   if (selectedElement.id == "paste") {paste(selectedElement); return;}

   showDialog(element, "editfiledialog"); editFileLoadData(element);  // now it can only be a file 
}

async function editFileLoadData(element) {
   const shadowRoot = file_manager.getShadowRootByContainedElement(element);
   const resp = await apiman.rest(API_OPERATEFILE, "POST", {path: selectedPath, op: "read"}, true);
   if (resp.result) shadowRoot.querySelector("#content").innerHTML = resp.data;
}

async function downloadFile(element) {
   const paths = selectedPath.split("/"); const file = paths[paths.length-1];
   const shadowRoot = file_manager.getShadowRootByContainedElement(element);
   try {
      const link = document.createElement("a");
      link.download = file; link.href = API_DOWNLOADFILE+"?path="+selectedPath;
      shadowRoot.appendChild(link); link.click(); shadowRoot.removeChild(link);
   } catch (err) {}
}

function cut(_element) { selectedCut = selectedPath }

function copy(_element) { selectedCopy = selectedPath }

function paste(element) {
   const selectedPathToOperate = selectedCut?selectedCut:selectedCopy;
   const baseName = selectedPathToOperate.substring(selectedPathToOperate.lastIndexOf("/")+1);
   if (selectedCut) _performRename(selectedCut, `${selectedPath}/${baseName}`, element);
   else if (selectedCopy) _performCopy(selectedCopy, `${selectedPath}/${baseName}`, element);
   selectedCut = null; selectedCopy = null;
}

async function doReplaceContent(element) {
   const shadowRoot = file_manager.getShadowRootByContainedElement(element);
   const data = shadowRoot.querySelector("#content").value;
   const resp = await apiman.rest(API_OPERATEFILE, "POST", {path: selectedPath, op: "write", data}, true);
   if (!resp.result) showErrorDialog(element);
   hideDialog(element);
}

async function showProgress(element, currentBlock, totalBlocks, fileName) {
   const templateID = "progressdialog"; 

   filesAndPercents[fileName] = Math.round(currentBlock/totalBlocks*100); 
   const files = []; for (const file of Object.keys(filesAndPercents)) files.push({name: file, percent: filesAndPercents[file]});

   await showDialog(element, templateID, {files});

   closeProgressAndReloadIfAllFilesUploaded(element, filesAndPercents);
}

function closeProgressAndReloadIfAllFilesUploaded(element, filesAndPercents) {
   for (const file of Object.keys(filesAndPercents)) if (filesAndPercents[file] != 100) return;
   setTimeout(_=>{hideDialog(element); router.reload();}, DIALOG_HIDE_WAIT); // hide dialog if all files done, after a certian wait
}

const showErrorDialog = async (element, hideAction) => showDialog(element, "error", {error:await i18n.get("Error", session.get($$.MONKSHU_CONSTANTS.LANG_ID))}, hideAction);

async function showDialog(element, dialogTemplateID, data, hideAction) {
   data = data || {}; const shadowRoot = file_manager.getShadowRootByContainedElement(element);

   let template = shadowRoot.querySelector(`template#${dialogTemplateID}`).innerHTML; 
   const matches = /<!--([\s\S]+)-->/g.exec(template);
   if (!matches) return; template = matches[1]; // can't show progress if the template is bad
   
   const rendered = await router.expandPageData(template, session.get($$.MONKSHU_CONSTANTS.PAGE_URL), data);
   if (hideAction) shadowRoot.querySelector(`#${DIALOG_HOST_ELEMENT_ID}`)["__com_wsadmin_hideAction"] = hideAction;
   shadowRoot.querySelector(`#${DIALOG_HOST_ELEMENT_ID}`).innerHTML = rendered;
}

function hideDialog(element) {
   const hostElement = file_manager.getShadowRootByContainedElement(element).querySelector(`#${DIALOG_HOST_ELEMENT_ID}`);
   while (hostElement && hostElement.firstChild) hostElement.removeChild(hostElement.firstChild);
   const hideAction = hostElement["__com_wsadmin_hideAction"]; if (hideAction) {hideAction(element); delete hostElement["__com_wsadmin_hideAction"]}
}

async function createFile(element, isDirectory=false) {
   const path = `${selectedPath}/${file_manager.getShadowRootByContainedElement(element).querySelector("#path").value}`;

   let resp = await apiman.rest(API_CREATEFILE, "GET", {path, isDirectory: isDirectory}, true);
   if (resp.result) router.reload(); else showErrorDialog(element);

   hideDialog(element);
}

function renameFile(element) {
   const oldName = selectedPath?selectedPath.substring(selectedPath.lastIndexOf("/")+1):null;
   showDialog(element, "renamefiledialog", oldName?{oldName}:undefined);
}

async function doRename(element) {
   const newName = file_manager.getShadowRootByContainedElement(element).querySelector("#renamepath").value;
   const subpaths = selectedPath.split("/"); subpaths.splice(subpaths.length-1, 1, newName);
   const newPath = subpaths.join("/");

   _performRename(selectedPath, newPath, element);

   hideDialog(element);
}

async function _performRename(oldPath, newPath, element) {
   const resp = await apiman.rest(API_RENAMEFILE, "GET", {old: oldPath, new: newPath}, true);
   if (!resp || !resp.result) showErrorDialog(element, _=>router.reload()); else router.reload();
}

async function _performCopy(fromPath, toPath, element) {
   const resp = await apiman.rest(API_COPYFILE, "GET", {from: fromPath, to: toPath}, true);
   if (!resp || !resp.result) showErrorDialog(element, _=>router.reload()); else router.reload();
}

export const file_manager = { trueWebComponentMode: true, elementConnected, elementRendered, handleClick, 
   showMenu, deleteFile, editFile, downloadFile, cut, copy, paste, upload, uploadFiles, hideDialog, createFile, 
   create, renameFile, doRename, doReplaceContent, menuEventDispatcher }
monkshu_component.register("file-manager", `${APP_CONSTANTS.APP_PATH}/components/file-manager/file-manager.html`, file_manager);