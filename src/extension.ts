import {
	commands,
	ConfigurationTarget,
	ExtensionContext,
	TextDocument,
	Uri,
	window,
	workspace,
} from 'vscode';

import { execFile } from 'child_process';
import { promisify } from 'util';
import { dirname } from 'path';

const execFileAsync = promisify(execFile);

/**
 * Matches shebangs like:
 *   #!/usr/bin/env -S uv run --script
 *   #!/usr/bin/env -S uv run --quiet --script
 * Captures any flags between `uv run` and `--script`.
 */
const UV_SHEBANG_RE = /^#!\s*\/usr\/bin\/env\s+-S\s+uv\s+run\s+(.*\s)?--script\b/;

const OUTPUT_CHANNEL = 'UV Shim';

let outputChannel: import('vscode').OutputChannel;

function log(msg: string): void {
	outputChannel.appendLine(`[${new Date().toISOString()}] ${msg}`);
}

export function activate(ctx: ExtensionContext): void {
	outputChannel = window.createOutputChannel(OUTPUT_CHANNEL);
	ctx.subscriptions.push(outputChannel);
	log('UV Shim extension activated.');

	// Process the active editor on startup.
	if (window.activeTextEditor)
		void handleDocument(window.activeTextEditor.document);

	// React when a Python file is opened or switched to.
	ctx.subscriptions.push(
		workspace.onDidOpenTextDocument((doc) => {
			if (doc.languageId === 'python')
				void handleDocument(doc);
		}),
		window.onDidChangeActiveTextEditor((editor) => {
			if (editor && editor.document.languageId === 'python')
				void handleDocument(editor.document);
		}),
		commands.registerCommand('uvshim.detectInterpreter', () => {
			if (window.activeTextEditor?.document.languageId === 'python')
				void handleDocument(window.activeTextEditor.document);
			else
				window.showWarningMessage('UV Shim: Active file is not a Python script.');
		}),
	);
}

/**
 * Check if a document has a uv shebang and, if so, resolve and set the
 * Python interpreter that `uv run --script` would use.
 */
async function handleDocument(doc: TextDocument): Promise<void> {
	if (doc.lineCount === 0) return;

	const firstLine = doc.lineAt(0).text;
	if (!UV_SHEBANG_RE.test(firstLine)) return;

	const scriptPath = doc.uri.fsPath;
	log(`Detected uv shebang in: ${scriptPath}`);

	const interpreter = await resolveUvInterpreter(scriptPath);
	if (!interpreter) return;

	await setPythonInterpreter(interpreter, doc.uri);
}

/**
 * Ask uv to resolve the Python interpreter for a given script.
 * Uses `uv run --script <path> python -c "import sys; print(sys.executable)"`.
 */
async function resolveUvInterpreter(scriptPath: string): Promise<string | undefined> {
	const cwd = dirname(scriptPath);
	try {
		const { stdout } = await execFileAsync(
			'uv',
			['run', '--script', scriptPath, 'python', '-c', 'import sys; print(sys.executable)'],
			{ cwd, timeout: 30_000 },
		);
		const resolved = stdout.trim();
		if (resolved) {
			log(`Resolved interpreter: ${resolved}`);
			return resolved;
		}
		log('uv returned empty output.');
	} catch (err: unknown) {
		const msg = err instanceof Error ? err.message : String(err);
		log(`Error resolving interpreter: ${msg}`);
		window.showErrorMessage(`UV Shim: Failed to resolve Python interpreter.\n${msg}`);
	}
	return undefined;
}

/**
 * Update `python.defaultInterpreterPath` in workspace-folder settings.
 */
async function setPythonInterpreter(interpreterPath: string, docUri: Uri): Promise<void> {
	const folder = workspace.getWorkspaceFolder(docUri);
	const config = workspace.getConfiguration('python', docUri);
	const current = config.get<string>('defaultInterpreterPath');

	if (current === interpreterPath) {
		log('Interpreter already set correctly; no change needed.');
		return;
	}

	const target = folder
		? ConfigurationTarget.WorkspaceFolder
		: ConfigurationTarget.Workspace;

	await config.update('defaultInterpreterPath', interpreterPath, target);

	const displayPath = workspace.asRelativePath(docUri);
	const message = `Python interpreter set to: ${interpreterPath} (from ${displayPath})`;
	log(message);
	window.showInformationMessage(`UV Shim: ${message}`);
}

export function deactivate(): void {
	// Nothing to clean up; disposables are handled via ctx.subscriptions.
}
