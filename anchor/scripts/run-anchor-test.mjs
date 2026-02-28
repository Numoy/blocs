import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const anchorRoot = path.resolve(__dirname, "..");
const anchorTomlPath = path.join(anchorRoot, "Anchor.toml");

const parsePort = (value, fallback) => {
    if (!value) return fallback;
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 65535) {
        return fallback;
    }
    return parsed;
};

const updateAnchorTomlPorts = (content, rpcPort, faucetPort) => {
    const withRpc = content.replace(
        /^(\s*rpc_port\s*=\s*)\d+/m,
        `$1${rpcPort}`,
    );
    const withFaucet = withRpc.replace(
        /^(\s*faucet_port\s*=\s*)\d+/m,
        `$1${faucetPort}`,
    );
    return withFaucet;
};

const isPortInUseError = (output) => {
    return output.includes("configured rpc port") && output.includes("already in use");
};

const runAnchorTest = (args) => {
    return spawnSync("anchor", args, {
        cwd: anchorRoot,
        env: process.env,
        encoding: "utf8",
        stdio: "pipe",
        maxBuffer: 25 * 1024 * 1024,
    });
};

const run = async () => {
    const originalToml = await fs.readFile(anchorTomlPath, "utf8");

    const preferredRpcPort = parsePort(process.env.ANCHOR_TEST_RPC_PORT, 18899);
    const preferredFaucetPort = parsePort(process.env.ANCHOR_TEST_FAUCET_PORT, 19900);
    const maxPortAttempts = parsePort(process.env.ANCHOR_TEST_MAX_PORT_ATTEMPTS, 10);
    const userArgs = process.argv.slice(2);

    let lastExitCode = 1;
    let lastOutput = "";

    try {
        for (let attempt = 0; attempt < maxPortAttempts; attempt += 1) {
            const rpcPort = preferredRpcPort + attempt;
            const faucetPort = preferredFaucetPort + attempt;
            const updatedToml = updateAnchorTomlPorts(originalToml, rpcPort, faucetPort);
            await fs.writeFile(anchorTomlPath, updatedToml, "utf8");

            const args = [
                "test",
                ...(attempt > 0 ? ["--skip-build"] : []),
                ...userArgs,
            ];

            // eslint-disable-next-line no-console
            console.log(
                `Running anchor test with rpc_port=${rpcPort} faucet_port=${faucetPort} (attempt ${attempt + 1}/${maxPortAttempts})`,
            );
            const result = runAnchorTest(args);
            process.stdout.write(result.stdout || "");
            process.stderr.write(result.stderr || "");

            const combinedOutput = `${result.stdout || ""}\n${result.stderr || ""}`;
            if (result.status === 0) {
                process.exit(0);
            }

            lastExitCode = typeof result.status === "number" ? result.status : 1;
            lastOutput = combinedOutput;

            if (!isPortInUseError(combinedOutput)) {
                process.exit(lastExitCode);
            }
        }
    } finally {
        await fs.writeFile(anchorTomlPath, originalToml, "utf8");
    }

    // eslint-disable-next-line no-console
    console.error(
        `anchor test failed after ${maxPortAttempts} attempts due rpc port collisions.`,
    );
    if (lastOutput) {
        // eslint-disable-next-line no-console
        console.error(lastOutput);
    }
    process.exit(lastExitCode || 1);
};

run().catch(async (error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exit(1);
});
