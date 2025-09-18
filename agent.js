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
    // This heuristic path works for default MT4 installations.
    const profilesPath = path.join(path.dirname(MT4_TERMINAL_PATH), '..', 'profiles');
    
    console.log(`Scanning for profiles in: ${profilesPath}`);

    if (!fs.existsSync(profilesPath)) {
        console.error("Error: Profiles directory not found. Please check MT4_TERMINAL_PATH.");
        // Try to find from AppData as a fallback
        const appDataPath = process.env.APPDATA;
        if (appDataPath) {
            // This is a common structure but might vary by broker.
            const brokerProfilesPath = path.join(appDataPath, 'MetaQuotes', 'Terminal');
            // This is complex because the final folder is a unique hash.
            // A more robust solution would involve scanning, but for now, we'll keep it simple.
            console.log("Could not find profiles next to terminal.exe. A more advanced search in %APPDATA% might be needed if profiles are stored there.");
        }
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
    const startCommand = `"${MT4_TERMINAL_PATH}" /profile:"${profileName}"`;

    exec(killCommand, (err, stdout, stderr) => {
        if (err && !stderr.includes("not found")) {
            console.warn(`Warning when killing terminal.exe: ${stderr}`);
        } else {
            console.log("Existing MT4 process terminated (or was not running).");
        }

        // Wait a moment before starting the new instance
        setTimeout(() => {
            console.log(`Executing: ${startCommand}`);
            exec(startCommand, (err_start, stdout_start, stderr_start) => {
                if (err_start) {
                    const errorMessage = `Error starting MT4: ${err_start.message}`;
                    console.error(errorMessage);
                    socket.emit('agent_log', { agent: AGENT_NAME, data: errorMessage });
                    return;
                }
                const successMessage = `MT4 started with profile '${profileName}' successfully.`;
                console.log(successMessage);
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
