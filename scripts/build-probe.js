const { execSync } = require("child_process");
function run(cmd){
  console.log("\n$ "+cmd);
  execSync(cmd,{stdio:"inherit"});
}
run("node -v");
run("npx @11ty/eleventy --version");
run("ls -la");
run("ls -la src || true");
run("npx @11ty/eleventy");
