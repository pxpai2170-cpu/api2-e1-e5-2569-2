const http = require("node:http");

const port = Number(process.env.PORT || 3000);
const esp32Url = (process.env.ESP32_URL || "http://192.168.4.1").replace(/\/+$/, "");

function sendJson(response, statusCode, payload) {
	const body = JSON.stringify(payload);
	response.writeHead(statusCode, {
		"Content-Type": "application/json; charset=utf-8",
		"Content-Length": Buffer.byteLength(body),
	});
	response.end(body);
}

async function readJson(request) {
	let body = "";

	for await (const chunk of request) {
		body += chunk;
		if (Buffer.byteLength(body) > 8192) {
			const error = new Error("Request body too large");
			error.statusCode = 413;
			throw error;
		}
	}

	try {
		return JSON.parse(body);
	} catch {
		const error = new Error("Request body must be valid JSON");
		error.statusCode = 400;
		throw error;
	}
}

async function proxyToEsp32(path, options = {}) {
	const upstream = await fetch(`${esp32Url}${path}`, {
		...options,
		signal: AbortSignal.timeout(20000),
	});
	const text = await upstream.text();

	try {
		return { statusCode: upstream.status, payload: JSON.parse(text) };
	} catch {
		return {
			statusCode: upstream.status,
			payload: { error: text || "Invalid response from ESP32" },
		};
	}
}

async function handleRequest(request, response) {
	const requestUrl = new URL(request.url, "http://localhost");

	if (request.method === "GET" && requestUrl.pathname === "/api/status") {
		const result = await proxyToEsp32("/api/status");
		sendJson(response, result.statusCode, result.payload);
		return;
	}

	if (request.method === "POST" && requestUrl.pathname === "/api/wifi") {
		const credentials = await readJson(request);
		const ssid = credentials.ssid;
		const password = credentials.password;

		if (
			typeof ssid !== "string" ||
			Buffer.byteLength(ssid) < 1 ||
			Buffer.byteLength(ssid) > 32 ||
			typeof password !== "string" ||
			Buffer.byteLength(password) > 63 ||
			(password.length > 0 && Buffer.byteLength(password) < 8)
		) {
			sendJson(response, 400, { error: "Invalid SSID or password" });
			return;
		}

		const form = new URLSearchParams({ ssid, password });
		const result = await proxyToEsp32("/api/wifi", {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: form,
		});
		sendJson(response, result.statusCode, result.payload);
		return;
	}

	sendJson(response, 404, { error: "Not found" });
}

const server = http.createServer((request, response) => {
	handleRequest(request, response).catch((error) => {
		const statusCode = error.statusCode || 502;
		const message = statusCode === 502 ? "ESP32 API is unavailable" : error.message;
		sendJson(response, statusCode, { error: message });
	});
});

server.listen(port, "127.0.0.1", () => {
	console.log(`API listening at http://127.0.0.1:${port}`);
	console.log(`ESP32 API: ${esp32Url}`);
});
