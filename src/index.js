const WebSocket = require('ws');
const MAX_SESSION_LEN = 64;
const clients = {};

function isIdEpic(id) {
    const idRe = /^[0-9a-zA-Z]+$/;
    return idRe.test(id) && parseInt(id, 16) > 0;
}

function isIdSteam(id) {
    const idRe = /^[0-9]+$/;
    return idRe.test(id) && parseInt(id) > 0;
}

function isIdGalaxy(id) {
    const idRe = /^[0-9]+$/;
    return idRe.test(id) && parseInt(id) > 0;
}

function isIdRallyHere(id) {
    const idRe = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/i;
	return idRe.test(id);
}

function isId(type, id) {
    if (type === "epic") return isIdEpic(id);
    if (type === "steam") return isIdSteam(id);
    if (type === "galaxy") return isIdGalaxy(id);
    if (type === "rallyhere") return isIdRallyHere(id);

    console.error(`Emulator ${type} unknown.`);
    return false;
}

function isSessionValid(sessionId) {
    return sessionId.length <= MAX_SESSION_LEN && /^[-_a-zA-Z0-9]+$/.test(sessionId);
}

function isAllowed(path) {
    const members = path.split('/');
    if (members.length !== 3) {
        console.error(`The URL must contain exactly 3 parts: (1): type, (2): session, (3): user id: ${path}: ${members}`);
        return false;
    }

    const serverType = members[0];
    const sessionName = members[1];
    const userId = members[2];

    if (!isSessionValid(sessionName)) {
        console.error(`The session is invalid, it must contain at most ${MAX_SESSION_LEN} alphanumeric chars: ${sessionName}`);
        return false;
    }

    if (!isId(serverType, userId)) {
        console.error(`Got a connection with an invalid id (${userId}). Dropping connection: ${serverType}`);
        return false;
    }

    const server = clients[serverType] ?? {};
    const session = server[sessionName] ?? {};
    if (userId in session) {
        console.error(`${userId} is already connected, or someone else used this id. Dropping connection.`);
        return false;
    }

    return true;
}

const port = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port });

console.log(`WebSocket server running on ws://localhost:${port}`);

wss.on('connection', (ws, request) => {
    const path = request.url.slice(1);

    if (!isAllowed(path)) {
        ws.close();
        return;
    }

    const [serverType, serverSession, clientId] = path.split('/');

    if (!clients[serverType]) {
        clients[serverType] = {};
    }

    if (!clients[serverType][serverSession]) {
        clients[serverType][serverSession] = {};
    }

    if (!clients[serverType][serverSession][clientId]) {
        console.log(`New client ${serverType}/${serverSession}/${clientId}`);
        clients[serverType][serverSession][clientId] = { websocket: ws };
    }

    ws.on('message', (message) => {
        if (message.length > 1024) {
            console.log(`Client ${serverType}/${serverSession}/${clientId} sent a message that is way too big, possible malicious payload?`);
            return;
        }

        try {
            const data = JSON.parse(message);
            //console.log(`Client ${serverType}/${serverSession}/${clientId} >>`, data);

            if (data.id) {
                if (data.type === 'list') {
                    const peerIds = Object.keys(clients[serverType][serverSession]);
                    const response = JSON.stringify({
                        source_id: clientId,
                        type: 'list',
                        peer_ids: peerIds
                    });
                    ws.send(response);
                } else if (data.id in clients[serverType][serverSession]) {
                    const destId = data.id;
                    //console.log(`Sending "${message}" to ${destId}`);
                    clients[serverType][serverSession][destId].websocket.send(JSON.stringify(data));
                }
            }
        } catch (error) {
            //console.error("Failed to parse JSON:", error);
        }
    });

    ws.on('close', () => {
        if (clients[serverType][serverSession][clientId]) {
            delete clients[serverType][serverSession][clientId];
            //console.log(`Removing client ${serverType}/${serverSession}/${clientId}`);
        }
    });

    ws.on('error', (error) => {
        console.error("WebSocket error:", error);
    });
});