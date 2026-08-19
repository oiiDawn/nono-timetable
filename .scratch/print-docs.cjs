const fs = require("fs");
const c = fs.readFileSync("e:/dev/nono-timetable/.scratch/docs-modal.json", "utf8");
const [, component, startPat, len] = process.argv;
const i = c.indexOf('"component": "' + component + '"');
if (i < 0) { console.log("not found"); process.exit(0); }
const j = startPat ? c.indexOf(startPat, i) : i;
console.log(c.slice(j < 0 ? i : j, (j < 0 ? i : j) + Number(len || 6000)));
