// A shared project, read-only: every design with a live preview (in the project's theme) and its code to copy.
import { mountShareList, copyTheme } from "./share-list.js";

const $ = (id) => document.getElementById(id);
const data = JSON.parse($("shareData").textContent);
$("themeCopy").addEventListener("click", (e) => copyTheme(e.currentTarget, data.project.theme));
mountShareList($("shareList"), data);
