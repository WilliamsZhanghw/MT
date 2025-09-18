const { io } = require("socket.io-client");
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// --- Configuration ---
// IMPORTANT: Replace with your actual server URL when you deploy it.
// For local testing, if the server is on another computer in the same network,
// use that computer's local IP address, e.g., "http://192.168.1.10:5001".
const SERVER_URL = "http://localhost:5001"; 

// IMPORTANT: Set the full path to your MT4 terminal.exe.
// Use double backslashes \\ in the path.
const MT4_TERMINAL_PATH = "C:\\Program Files (x86)\\Your MT4 Broker Name\\terminal.exe";

// --- Agent Identification ---
// A unique name for this Windows machine.
const AGENT_NAME = "Windows-Trading-PC-01"; 

const socket = io(SERVER_URL);

// --- Core Functions ---

/**
 * Scans the MT4 profiles directory and returns a list of available profile names.
 */
function getAvailableProfiles() {
    const mt4DataPath = path.join(path.dirname(MT4_TERMINAL_PATH), 'MQL4'); // Heuristic guess
    const profilesPath = path.join(mt4DataPath, '..', 'profiles');
    
    // A more reliable way is often to find the data path from Roaming AppData
    // but this requires more complex logic. For now, we assume it's near terminal.exe.
    
    console.log(`Scanning for profiles in: ${profilesPath}`);

    if (!fs.existsSync(profilesPath)) {
        console.error("Error: Profiles directory not found. Please check MT4_TERMINAL_PATH.");
        return [];
    }

    try {
        const directories = fs.readdirSync(profilesPath, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);
        
        // Exclude 'default' and 'tester' which are system profiles
        return directories.filter(name => name.toLowerCase() !== 'default' && name.toLowerCase() !== 'tester');
    } catch (error) {
        console.error("Error reading profiles directory:", error);
        return [];
    }
}

/**
 * Executes the command to restart MT4 with a specific profile.
 */
function startMt4WithProfile(profileName) {
    console.log(`Attempting to start MT4 with profile: ${profileName}`);

    // Command to kill any running MT4 instance first
    const killCommand = 'taskkill /F /IM terminal.exe';
    
    // Command to start MT4 with the specified profile
    // Note: The /portable flag is often useful if your MT4 installation is self-contained.
    const startCommand = `"${MT4_TERMINAL_PATH}" /profile:"${profileName}"`;

    exec(killCommand, (err, stdout, stderr) => {
        if (err) {
            console.warn("Could not kill terminal.exe (it might not have been running, which is okay).");
        } else {
            console.log("Existing MT4 process terminated.");
        }

        // Wait a moment before starting the new instance
        setTimeout(() => {
            console.log(`Executing: ${startCommand}`);
            exec(startCommand, (err, stdout, stderr) => {
                if (err) {
                    console.error(`Error starting MT4: ${err.message}`);
                    socket.emit('agent_log', { agent: AGENT_NAME, data: `Error starting MT4: ${err.message}` });
                    return;
                }
                console.log(`MT4 started with profile '${profileName}' successfully.`);
                socket.emit('agent_log', { agent: AGENT_NAME, data: `Successfully switched to profile: ${profileName}` });
            });
        }, 2000); // 2-second delay
    });
}


// --- Socket.IO Event Handlers ---

socket.on('connect', () => {
    console.log(`Connected to server at ${SERVER_URL}`);
    
    // Identify as an agent
    socket.emit('register_agent', { name: AGENT_NAME });
    
    // Report available profiles
    const profiles = getAvailableProfiles();
    console.log("Found profiles:", profiles);
    socket.emit('report_profiles', { agent: AGENT_NAME, profiles: profiles });
});

socket.on('start_profile', (data) => {
    // Ensure the command is for this agent
    if (data.agent === AGENT_NAME) {
        console.log(`Received command to start profile: ${data.profile}`);
        startMt4WithProfile(data.profile);
    }
});

socket.on('disconnect', () => {
    console.log('Disconnected from server. Will try to reconnect...');
});

console.log("Starting MT4 Management Agent...");
