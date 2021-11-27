const Core = require("@actions/core");
const ToolCache = require("@actions/tool-cache");
const Cache = require("@actions/cache");
const IO = require("@actions/io");
const Octokit = require("@octokit/request");
const {cmpTags} = require("tag-cmp");
const Path = require("path");
const ChildProcess = require("child_process");
const Util = require("util");
const OS = require("os");
const FS = require("fs").promises;

const execFile = Util.promisify(ChildProcess.execFile);

const Linux = "Linux", Mac = "macOS", Windows = "Windows";

const sysPlatform = process.env["INSTALL_SFML_PLATFORM"] || process.platform;
const platform = {"linux": Linux, "darwin": Mac, "win32": Windows}[sysPlatform] || sysPlatform;

let sudo = function (command) {
    command.unshift("sudo", "-n");
    return command;
};

async function run() {
    if (platform === Windows || !await IO.which("sudo")) {
        sudo = (command) => command;
    }

    try {
        const params = {"sfml": "latest", "config": "Release"};
        for (const key of ["sfml", "config"]) {
            let value;
            if ((value = Core.getInput(key))) {
                params[key] = value;
            }
        }
        params.config = params.config.charAt(0).toUpperCase() + params.config.slice(1);

        if (params.sfml === Package && platform === Linux) {
            await installSfmlApt();
        } else if (params.sfml === Package && platform === Mac) {
            await installSfmlBrew();
        } else {
            await installSfmlFromSource(params);
        }
    } catch (error) {
        Core.setFailed(error);
        process.exit(1);
    }
}

const Latest = "latest";
const Nightly = "nightly";
const Package = "package";
const NumericVersion = /^[0-9]+(\.[0-9]+)+$/;
const NumericVersionSub = /(\b[0-9]+(\.[0-9]+)+(?=\W|_))/;

function checkVersion(what, version, allowed) {
    const numericVersion = NumericVersion.test(version) && version;
    allowed[allowed.indexOf(NumericVersion)] = numericVersion;

    if (allowed.includes(version)) {
        return version;
    }
    if ([Latest, Nightly, Package, numericVersion].includes(version)) {
        throw `Version "${version}" of ${what} is not supported on ${platform}`;
    }
    throw `Version "${version}" of ${what} is invalid`;
}

async function subprocess(command, options) {
    Core.info("[command]" + command.join(" "));
    const [file, ...args] = command;
    return execFile(file, args, options);
}

function addPath(key, ...items) {
    if (process.env[key]) {
        items.unshift(process.env[key]);
    }
    Core.exportVariable(key, items.join(Path.delimiter));
}

async function installSfmlApt() {
    await installAptPackages(["libsfml-dev", "xvfb"]);
    const {stdout} = await subprocess(["dpkg", "-s", "libsfml-dev"]);
    Core.setOutput("sfml", stdout.match(NumericVersionSub)[0]);
    Core.setOutput("path", "/usr");
}

async function installSfmlAptDeps({sfml}) {
    checkVersion("SFML", sfml, [NumericVersion]);
    let packages = [
        "libxrandr-dev", "libudev-dev", "libopenal-dev", "libflac-dev", "libvorbis-dev",
        "libgl1-mesa-dev", "libegl1-mesa-dev",
    ];
    if (cmpTags(sfml, "2.6") >= 0) {
        packages.push("libxcursor-dev");
    }
    if (cmpTags(sfml, "2.5") < 0) {
        packages.push("libjpeg-dev");
    }
    if (cmpTags(sfml, "2.4") < 0) {
        packages.push("freeglut3-dev", "libxcb-image0-dev");
    }
    packages.push("cmake", "xvfb");
    return installAptPackages(packages.sort());
}

async function installAptPackages(packages) {
    Core.info("Installing packages");
    try {
        await subprocess(sudo(["apt-get", "update"]));
    } catch (error) {}
    const {stdout} = await subprocess(sudo([
        "apt-get", "install", "-qy", "--no-install-recommends", "--no-upgrade", "--",
    ].concat(packages)));
    Core.startGroup("Finished installing packages");
    Core.info(stdout);
    Core.endGroup();
}

async function installSfmlBrew() {
    await installBrewPackages(["sfml"]);
    const {stdout} = await subprocess(["brew", "list", "sfml"]);
    const regex = new RegExp("^/[\\w/]+/sfml/" + NumericVersionSub.source + "[^/]*", "m");
    const [path, sfml] = stdout.match(regex);
    Core.setOutput("sfml", sfml);
    Core.setOutput("path", path);
}

async function installSfmlBrewDeps({sfml}) {
    checkVersion("SFML", sfml, [NumericVersion]);
    let packages = ["flac", "freetype", "libogg", "libvorbis"];
    if (cmpTags(sfml, "2.5") < 0) {
        packages.push("jpeg");
    }
    return installBrewPackages(packages.sort());
}

async function installBrewPackages(packages) {
    Core.info("Installing packages");
    Core.exportVariable("HOMEBREW_NO_INSTALL_CLEANUP", "1");
    const {stdout} = await subprocess(["brew", "install"].concat(packages));
    Core.startGroup("Finished installing packages");
    Core.info(stdout);
    Core.endGroup();
}

async function installSfmlFromSource({sfml, config}) {
    checkVersion("SFML", sfml, [Latest, Nightly, NumericVersion]);

    let depsFunc = async () => {};
    if (platform === Linux) {
        depsFunc = installSfmlAptDeps;
    } else if (platform === Mac) {
        depsFunc = installSfmlBrewDeps;
    }
    const depsTask = depsFunc({sfml: (sfml === Nightly || sfml === Latest) ? "2.6.0" : sfml});

    const ref = await findRef({name: "SFML", version: sfml, apiBase: GitHubApiBase});
    Core.setOutput("sfml", ref);
    const path = Path.join(process.env["RUNNER_TEMP"], `sfml-${sfml}-${config}`);
    const cacheKey = `install-sfml-v1-${ref}-${config}--${OS.arch()}-${OS.platform()}-${OS.release()}`;

    let restored = null;
    try {
        Core.info(`Trying to restore cache: key '${cacheKey}`);
        restored = await Cache.restoreCache([path], cacheKey);
    } catch (error) {
        Core.warning(error.message);
    }
    if (!restored) {
        Core.info(`Cache not found for key '${cacheKey}'`);
        await downloadSource({name: "SFML", ref, path, apiBase: GitHubApiBase});
    }
    try {
        FS.unlink(Path.join(path, "CMakeCache.txt"));
    } catch (error) {}

    await depsTask;
    {
        const command = ["cmake", "."];
        if (platform !== Windows) {
            command.push(`-DCMAKE_BUILD_TYPE=${config}`);
        }
        if (platform === Linux) {
            command.push("-DCMAKE_INSTALL_PREFIX=/usr");
        }
        const {stdout} = await subprocess(command, {cwd: path});
        Core.startGroup("Finished configuring SFML");
        Core.info(stdout);
        Core.endGroup();
    }
    const command = ["cmake", "--build", ".", "-j", "4"];
    {
        if (platform === Windows) {
            command.push("--config", config);
        }
        const {stdout} = await subprocess(command, {cwd: path});
        Core.startGroup("Finished building SFML");
        Core.info(stdout);
        Core.endGroup();
    }
    {
        command.push("--target", "install");
        const {stdout} = await subprocess(sudo(command), {cwd: path});
        Core.startGroup("Finished installing SFML");
        Core.info(stdout);
        Core.endGroup();
    }
    if (platform === Windows) {
        const base = "C:\\Program Files (x86)\\SFML";
        addPath("INCLUDE", Path.join(base, "include"));
        addPath("LIB", Path.join(base, "lib"));
        addPath("PATH", Path.join(base, "bin"));
        Core.setOutput("path", base);
    } else if (platform === Linux) {
        Core.setOutput("path", "/usr");
    } else {
        Core.setOutput("path", "/usr/local");
    }

    if (restored !== cacheKey) {
        Core.info(`Saving cache: '${cacheKey}'`);
        try {
            await Cache.saveCache([path], cacheKey);
        } catch (error) {
            Core.warning(error.message);
        }
    }
}

const GitHubApiBase = "/repos/SFML/SFML";

async function findRelease({name, apiBase, tag}) {
    Core.info(`Looking for latest ${name} release`);
    const releasesResp = await githubGet({
        url: apiBase + "/releases/" + (tag ? "tags/" + tag : "latest"),
    });
    const release = releasesResp.data;
    Core.info(`Found ${name} release ${release["html_url"]}`);
    return release;
}

async function findLatestCommit({name, apiBase, branch = "master"}) {
    Core.info(`Looking for latest ${name} commit`);
    const commitsResp = await githubGet({
        url: apiBase + "/commits/:branch",
        "branch": branch,
    });
    const commit = commitsResp.data;
    Core.info(`Found ${name} commit ${commit["html_url"]}`);
    return commit["sha"];
}

async function findRef({name, apiBase, version}) {
    if (version === Nightly) {
        return findLatestCommit({name, apiBase});
    } else if (version === Latest) {
        const release = await findRelease({name, apiBase});
        return release["tag_name"];
    }
    return version;
}

async function downloadSource({name, apiBase, ref, path}) {
    Core.info(`Downloading ${name} source for ${ref}`);
    const downloadedPath = await githubDownloadViaRedirect({
        url: apiBase + "/zipball/:ref",
        "ref": ref,
    });
    Core.info(`Extracting ${name} source`);
    const extractedPath = await ToolCache.extractZip(downloadedPath);
    await IO.mv(await onlySubdir(extractedPath), path);
}

function githubGet(request) {
    Core.debug(request);
    const token = Core.getInput("token");
    const octokit = token ? Octokit.request.defaults({
        headers: {"authorization": "token " + token},
    }) : Octokit.request;
    return octokit(request);
}

async function githubDownloadViaRedirect(request) {
    request.request = {redirect: "manual"};
    const resp = await githubGet(request);
    return ToolCache.downloadTool(resp.headers["location"]);
}

async function onlySubdir(path) {
    const [subDir] = await FS.readdir(path);
    return Path.join(path, subDir);
}

if (require.main === module) {
    run();
}
