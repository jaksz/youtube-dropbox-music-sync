require("dotenv").config();
const assert = require("assert");
const Promise = require("bluebird");
const youtubeSearch = require("youtube-search");
const moment = require("moment");
const { execSync } = require("child_process");
const glob = require("glob");
const fs = require("fs");

const ENV_VARS = [
  "DROPBOX_ACCESS_TOKEN",
  "YOUTUBE_SEARCH_TOKEN",
  "SEARCH_TERMS"
];

for (let variable of ENV_VARS) {
  assert.ok(process.env[variable]);
}

const dfs = Promise.promisifyAll(
  require("dropbox-fs")({ apiKey: process.env.DROPBOX_ACCESS_TOKEN })
);

const YOUTUBE_SEARCH_OPTIONS = {
  key: process.env.YOUTUBE_SEARCH_TOKEN,
  maxResults: process.env.MAX_RESULTS_PER_TERM || 10,
  type: "video",
  publishedAfter: moment()
    .subtract(process.env.MAX_DAYS_AGO_PUBLISHED || 7, "days")
    .format(),
  videoDuration: "long",
  videoDefinition: "high",
  order: "viewCount"
};
const MP3_FOLDER = "mp3s";
const EXEC_OPTIONS = { stdio: "inherit", cwd: process.cwd() };
const terms = process.env.SEARCH_TERMS.split(",");

const run = async () => {
  console.log(`Getting ids for ${terms.join(",")}...`);
  let ids;
  ids = terms.map(term => youtubeSearch(term, YOUTUBE_SEARCH_OPTIONS));
  ids = await Promise.all(ids);
  ids = ids.map(id => id.results);
  ids = [].concat(...ids);
  ids = ids.map(result => result.id);
  ids = [...new Set(ids)];
  ids = ids.map(e => `'${e}'`);
  let count = ids.length;
  ids = ids.join(" ");

  console.log("Deleting local folder...");
  execSync(`rm -f ${MP3_FOLDER}/*`, EXEC_OPTIONS);

  console.log(`Downloading ${count} files...`);
  execSync(
    `youtube-dl -x --audio-format=mp3 -o ${MP3_FOLDER}/\'%(id)s.%(ext)s\' ${ids}`,
    EXEC_OPTIONS
  );

  const files = glob.sync(`${MP3_FOLDER}/*`);

  console.log("Deleting dropbox folder...");
  await dfs.rmdirAsync(`/${MP3_FOLDER}`);

  console.log(`Uploading ${files.length} files...`);
  for (let file of files) {
    console.log(`Uploading ${file}...`);
    let content = fs.readFileSync(file);
    await dfs.writeFileAsync(`/${file}`, content, { encoding: "utf8" });
  }
  console.log("Done!");
};

run();
