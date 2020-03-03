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

let mouseX, mouseY, menuOpen, timer, selectedPath, selectedIsDirectory, selectedElement, filesAndPercents;

const DIALOG_HIDE_WAIT = 1300;

const API_GETFILES = APP_CONSTANTS.BACKEND+"/apps/"+APP_CONSTANTS.APP_NAME+"/getfiles";
const API_UPLOADFILE = APP_CONSTANTS.BACKEND+"/apps/"+APP_CONSTANTS.APP_NAME+"/uploadfile";
const API_DELETEFILE = APP_CONSTANTS.BACKEND+"/apps/"+APP_CONSTANTS.APP_NAME+"/deletefile";
const API_CREATEFILE = APP_CONSTANTS.BACKEND+"/apps/"+APP_CONSTANTS.APP_NAME+"/createfile";
const API_RENAMEFILE = APP_CONSTANTS.BACKEND+"/apps/"+APP_CONSTANTS.APP_NAME+"/renamefile";
const API_OPERATEFILE = APP_CONSTANTS.BACKEND+"/apps/"+APP_CONSTANTS.APP_NAME+"/operatefile";

const DIALOG_HOST_ELEMENT_ID = "templateholder";

const IO_CHUNK_SIZE = 4096;   // 4K read buffer

async function elementConnected(element) {
   menuOpen = false; 

   const path = element.getAttribute("path") || "/"; selectedPath = path.replace(/[\/]+/g,"/"); selectedIsDirectory = true;
   let resp = await apiman.rest(API_GETFILES, "GET", {path}, true);
   if (!resp.result) return;

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

   document.addEventListener("click", _e => {
      if (!menuOpen) return;

      const shadowRoot = file_manager.getShadowRootByHostId(element.getAttribute("id"));
      shadowRoot.querySelector("div#contextmenu").classList.remove("visible")
      menuOpen = false;
   });
}

function handleClick(element, path, isDirectory) {
   selectedPath = path?path.replace(/[\/]+/g,"/"):selectedPath; 
   selectedIsDirectory = (isDirectory!== undefined) ? util.parseBoolean(isDirectory) : selectedIsDirectory;
   selectedElement = element;
   
   if (timer) {clearTimeout(timer); editFile(element); timer=null;}
   else timer = setTimeout(_=> {timer=null;showMenu(element)}, 200);
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

function showMenu(element) {
   const shadowRoot = file_manager.getShadowRootByContainedElement(element);

   if (element.getAttribute("id") && (element.getAttribute("id") == "home" || element.getAttribute("id") == "back" || element.getAttribute("id") == "upload" || element.getAttribute("id") == "create")) {
      shadowRoot.querySelector("div#contextmenu > span#hr").classList.add("hidden"); 
      shadowRoot.querySelector("div#contextmenu > span#renamefile").classList.add("hidden");
      shadowRoot.querySelector("div#contextmenu > span#deletefile").classList.add("hidden");  
   } else {
      shadowRoot.querySelector("div#contextmenu > span#hr").classList.remove("hidden"); 
      shadowRoot.querySelector("div#contextmenu > span#renamefile").classList.remove("hidden");
      shadowRoot.querySelector("div#contextmenu > span#deletefile").classList.remove("hidden");  
   }

   const contextMenu = shadowRoot.querySelector("div#contextmenu");
   contextMenu.style.top = mouseY+"px"; contextMenu.style.left = mouseX+"px";
   contextMenu.classList.add("visible");   
   menuOpen = true;
}

async function deleteFile(_element) {
   let resp = await apiman.rest(API_DELETEFILE, "GET", {path: selectedPath}, true);
   if (resp.result) router.reload(); else alert("Error");
}

function editFile(element) {
   if (selectedIsDirectory) {
      const urlToLoad = util.replaceURLParamValue(session.get($$.MONKSHU_CONSTANTS.PAGE_URL), "path", selectedPath);
      router.loadPage(urlToLoad);
      return;
   } 

   if (selectedElement.id == "upload") {upload(selectedElement); return;}

   if (selectedElement.id == "create") {create(selectedElement); return;}

   showDialog(element, "editfiledialog"); editFileLoadData(element);  // now it can only be a file 
}

async function editFileLoadData(element) {
   const shadowRoot = file_manager.getShadowRootByContainedElement(element);
   const resp = await apiman.rest(API_OPERATEFILE, "POST", {path: selectedPath, op: "read"}, true);
   if (resp.result) shadowRoot.querySelector("#content").innerHTML = resp.data;
}

async function doReplaceContent(element) {
   const shadowRoot = file_manager.getShadowRootByContainedElement(element);
   const data = shadowRoot.querySelector("#content").value;
   const resp = await apiman.rest(API_OPERATEFILE, "POST", {path: selectedPath, op: "write", data}, true);
   if (!resp.result) alert("Error");
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

async function showDialog(element, dialogTemplateID, data={}) {
   const shadowRoot = file_manager.getShadowRootByContainedElement(element);

   let template = shadowRoot.querySelector(`template#${dialogTemplateID}`).innerHTML; 
   const matches = /<!--([\s\S]+)-->/g.exec(template);
   if (!matches) return; template = matches[1]; // can't show progress if the template is bad
   
   const rendered = await router.expandPageData(template, session.get($$.MONKSHU_CONSTANTS.PAGE_URL), data);
   shadowRoot.querySelector(`#${DIALOG_HOST_ELEMENT_ID}`).innerHTML = rendered;
}

function hideDialog(element) {
   const hostElement = file_manager.getShadowRootByContainedElement(element).querySelector(`#${DIALOG_HOST_ELEMENT_ID}`);
   while (hostElement && hostElement.firstChild) hostElement.removeChild(hostElement.firstChild);
}

function register() {
   // convert this all into a WebComponent so we can use it
   monkshu_component.register("file-manager", `${APP_CONSTANTS.APP_PATH}/components/file-manager/file-manager.html`, file_manager);
}

async function createFile(element, isDirectory=false) {
   const path = file_manager.getShadowRootByContainedElement(element).querySelector("#path").value;

   let resp = await apiman.rest(API_CREATEFILE, "GET", {path, isDirectory: isDirectory}, true);
   if (resp.result) router.reload(); else alert("Error");

   hideDialog(element);
}

const renameFile = element => showDialog(element, "renamefiledialog");

async function doRename(element) {
   const newName = file_manager.getShadowRootByContainedElement(element).querySelector("#renamepath").value;
   const subpaths = selectedPath.split("/"); subpaths.splice(subpaths.length-1, 1, newName);
   const newPath = subpaths.join("/");

   let resp = await apiman.rest(API_RENAMEFILE, "GET", {old: selectedPath, new: newPath}, true);
   if (resp.result) router.reload(); else alert("Error");

   hideDialog(element);
}

const trueWebComponentMode = true;	// making this false renders the component without using Shadow DOM

export const file_manager = {trueWebComponentMode, register, elementConnected, elementRendered, handleClick, showMenu, deleteFile, editFile, upload, uploadFiles, hideDialog, createFile, renameFile, doRename, doReplaceContent}