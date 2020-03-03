/* 
 * (C) 2020 TekMonks. All rights reserved.
 * License: MIT - see enclosed license.txt file.
 */

import {loginmanager} from "./loginmanager.mjs"

let menuOpen, ignoreClick;

function registerHandlers() {
    menuOpen = false; ignoreClick = false; 

    document.addEventListener("click", e => {   // close menu if clicked outside
        if (!menuOpen) return;
        if (ignoreClick) {ignoreClick = false; return;}

        if (e.target.closest("#menubutton")) {
            let menuDiv = document.querySelector("div#menu"); menuDiv.style.maxHeight = 0; 
            menuDiv.classList.remove("visible");

            document.querySelector("span#menubutton").innerHTML="☰";
            menuOpen = false;
        }
    });
}

function showMenu() {
    if (menuOpen) return;

    let menuDiv = document.querySelector("div#menu"); menuDiv.style.maxHeight = menuDiv.scrollHeight+"px";
    menuDiv.classList.add("visible");

    document.querySelector("span#menubutton").innerHTML="X";

    menuOpen = true;
    ignoreClick = true;
}

function logout() {
    loginmanager.logout();
}

export const main = {showMenu, logout, registerHandlers}