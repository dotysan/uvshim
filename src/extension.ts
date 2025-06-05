import {
	ExtensionContext, // interface
	TextDocument, // interface
	window, // namespace
	workspace, // namespace
} from 'vscode';

import {
	execSync,
} from 'child_process';

const UV_SHEBANG = /^#!\s*\/usr\/bin\/env\s+-S\s+uv\s+run\s+(.*?)--script\b(.*)/;

export function activate(ctx: ExtensionContext): void {
	console.log('Extension "uvshim" is now active!');

	const trash = workspace.onDidOpenTextDocument((doc: TextDocument) => {
		if (doc.languageId !== 'python') return;
		configurePythonInterpreter(doc);
	});
	ctx.subscriptions.push(trash);
}

async function configurePythonInterpreter(doc: TextDocument): Promise<void> {
	const firstline = doc.lineAt(0).text.trim();
	const match = firstline.match(UV_SHEBANG);
	if (!match) return;

	const [args1, args2] = match.slice(1, 3).map(arg => arg.trim());
	const uv_run = `uv run ${args1} ${args2} python -c 'import sys;print(sys.executable)'`;

	let pybin = '';
	try {
		pybin = execSync(uv_run, { encoding: 'utf8' }).trim();
	} catch (err) {
		console.warn('Error executing uv run command:', err);
		window.showErrorMessage('Failed to determine Python interpreter from `uv run` command.');
		return;
	}

	const config = workspace.getConfiguration('python');
	const current = config.get<string>('defaultInterpreterPath');
	if (current === pybin) return;

	await config.update('defaultInterpreterPath', pybin);
	const docname = workspace.asRelativePath(doc.uri);
	console.log(`Configured Python interpreter for ${docname}: ${pybin}`);
	window.showInformationMessage(`Python interpreter set to: ${pybin}`);
}

export function deactivate(): void {
	console.log('Extension "uvshim" is now inactive.');
}
