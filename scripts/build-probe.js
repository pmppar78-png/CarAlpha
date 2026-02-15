// Build probe — diagnostic only, NOT used during production builds.
// Previously used child_process.execSync which can trigger EAGAIN errors
// on resource-constrained build runners. Replaced with safe console output.
//
// To diagnose builds, check the build command output in netlify.toml instead.

console.log("Node version:", process.version);
console.log("Heap limit:", require("v8").getHeapStatistics().heap_size_limit / 1024 / 1024, "MB");
console.log("CWD:", process.cwd());
console.log("Build probe complete — use 'npx @11ty/eleventy' to run a build.");
