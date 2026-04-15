/**
 * Spec plugin tools - TypeScript entry point
 * Handles create_spec and start_spec tool invocations via PluginToolAdapter protocol.
 */

function getCall() {
    const envVar = process.env.RHYTHM_PLUGIN_CALL;
    if (!envVar) {
        throw new Error("RHYTHM_PLUGIN_CALL environment variable not set");
    }
    return JSON.parse(envVar);
}

function outputResult(result) {
    console.log(JSON.stringify(result));
}

async function handleCreateSpec(input) {
    const { title, goal, overview } = input;

    const result = {
        kind: "spec_tool_result",
        action: "create_spec",
        title,
        goal,
        overview: overview ?? "",
    };

    outputResult({ ok: true, output: JSON.stringify(result) });
}

async function handleStartSpec(input) {
    const { slug } = input;

    const result = {
        kind: "spec_tool_result",
        action: "start_spec",
        slug,
    };

    outputResult({ ok: true, output: JSON.stringify(result) });
}

async function main() {
    const call = getCall();
    const handler = process.argv[2];

    if (!handler) {
        outputResult({ ok: false, error: "No handler specified" });
        return;
    }

    try {
        switch (handler) {
            case "create_spec":
                await handleCreateSpec(call.input);
                break;
            case "start_spec":
                await handleStartSpec(call.input);
                break;
            default:
                outputResult({ ok: false, error: `Unknown handler: ${handler}` });
        }
    } catch (err) {
        outputResult({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
}

main();