const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const zmq = require("zeromq");
const path = require('path');

// --- Configuration ---
const ZMQ_PORT = "5555";
const WEB_HOST = "0.0.0.0";
const WEB_PORT = 5001;

// --- Express & Socket.IO App Setup ---
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve the HTML file from the 'templates' directory
app.use(express.static(path.join(__dirname, 'templates')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'templates', 'index.html'));
});

// --- ZeroMQ Communication Handler ---
let mt4Identity = null;
const sock = new zmq.Router();

// --- State Management ---
const agents = {}; // Store agent data: { socketId: { name, profiles } }

async function runZmqListener() {
    await sock.bind(`tcp://*:${ZMQ_PORT}`);
    console.log(`ZMQ ROUTER Server started on port ${ZMQ_PORT}`);

    for await (const [identity, msg] of sock) {
        if (!mt4Identity) {
            mt4Identity = identity;
            console.log(`MT4 client connected with identity: ${identity.toString('hex')}`);
        }
        const message = msg.toString('utf-8');
        // console.log(`Received from MT4: ${message}`); // Uncomment for verbose logging
        
        // --- Message Routing ---
        const parts = message.split('|');
        const topic = parts[0];

        switch(topic) {
            case 'TICK':
                // Format: TICK|DATA|SYMBOL|BID|ASK
                io.emit('tick_data', { symbol: parts[2], bid: parseFloat(parts[3]), ask: parseFloat(parts[4]) });
                break;
            case 'ALERT':
                // Format: ALERT|TRIGGERED|...details...
                io.emit('price_alert', { data: message });
                break;
            default:
                // All other messages go to the general log
                io.emit('log_message', { data: message });
        }
    }
}

async function sendZmqCommand(command) {
    if (mt4Identity) {
        // console.log(`Sending command to MT4: ${command}`); // Uncomment for verbose logging
        await sock.send([mt4Identity, command]);
        io.emit('log_message', { data: `Sent to MT4: ${command}` });
    } else {
        console.log("Cannot send command: MT4 client not connected.");
        io.emit('log_message', { data: "Error: MT4 client not connected." });
    }
}

// --- Socket.IO Event Handlers ---
io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);

    // Immediately send the current list of agents to the newly connected client
    socket.emit('update_agents', Object.values(agents));

    socket.on('register_agent', (data) => {
        console.log(`Agent registered: ${data.name} with socket ID ${socket.id}`);
        agents[socket.id] = { name: data.name, profiles: [] };
        // Broadcast the updated agent list to all web clients
        io.emit('update_agents', Object.values(agents));
    });

    socket.on('report_profiles', (data) => {
        if (agents[socket.id]) {
            console.log(`Received profiles from agent ${data.agent}:`, data.profiles);
            agents[socket.id].profiles = data.profiles;
            io.emit('update_agents', Object.values(agents));
        }
    });

    // Handle trade commands from web clients
    socket.on('send_trade_command', (data) => {
        console.log('Received trade command from web client:', data);
        const command = `TRADE|OPEN|${data.type}|${data.symbol}|${data.volume}|${data.sl}|${data.tp}`;
        sendZmqCommand(command);
    });

    // Handle price alert settings
    socket.on('set_alert', (data) => {
        console.log('Received alert setting from web client:', data);
        const command = `ALERT|SET|${data.symbol}|${data.condition}|${data.price}`;
        sendZmqCommand(command);
    });
    
    // Handle tick subscription from web clients
    socket.on('subscribe_symbol', (data) => {
        console.log('Received symbol subscription from web client:', data);
        const command = `TICK|SUBSCRIBE|${data.symbol}`;
        sendZmqCommand(command);
    });

    // Handle "start profile" command from web clients
    socket.on('start_profile_on_agent', (data) => {
        console.log(`Web client requests to start profile '${data.profile}' on agent '${data.agent}'`);
        // Find the agent's socket ID by its name
        const agentSocketId = Object.keys(agents).find(id => agents[id].name === data.agent);
        if (agentSocketId) {
            // Forward the command to the specific agent
            io.to(agentSocketId).emit('start_profile', { agent: data.agent, profile: data.profile });
            // Log this action to all web clients
            io.emit('log_message', { data: `Command sent to ${data.agent}: Start profile ${data.profile}` });
        } else {
            io.emit('log_message', { data: `Error: Agent ${data.agent} not found or is disconnected.` });
        }
    });

    // Handle logs from agents
    socket.on('agent_log', (data) => {
        io.emit('log_message', { data: `[Agent: ${data.agent}] ${data.data}` });
    });

    socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
        // If the disconnected client was an agent, remove it
        if (agents[socket.id]) {
            console.log(`Agent ${agents[socket.id].name} disconnected.`);
            delete agents[socket.id];
            // Broadcast the updated agent list
            io.emit('update_agents', Object.values(agents));
        }
    });
});

// --- Main Execution ---
server.listen(WEB_PORT, WEB_HOST, () => {
    console.log(`Starting web server on http://${WEB_HOST}:${WEB_PORT}`);
});

// Start the ZMQ listener
runZmqListener().catch(err => {
    console.error("ZMQ Listener error:", err);
    process.exit(1);
});
