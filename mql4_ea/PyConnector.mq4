//+------------------------------------------------------------------+
//|                                                  PyConnector.mq4 |
//|                      Copyright 2025, YOUR_NAME                   |
//|                                              https://www.example.com |
//+------------------------------------------------------------------+
#property copyright "Copyright 2025, YOUR_NAME"
#property link      "https://www.example.com"
#property version   "1.00"
#property strict

/*
    IMPORTANT SETUP INSTRUCTIONS:
    
    This EA requires the libzmq.dll and zmq.mqh files to communicate with Python.
    
    1. Download the MT4 ZMQ library from a reliable source. A recommended one is:
       https://github.com/AustenConrad/mql-zmq
       - Go to the "releases" page and download the latest version (e.g., mql-zmq-x.x.x.zip).

    2. Place the files in the correct MT4 folders:
       - Open MT4.
       - Go to "File" -> "Open Data Folder".
       - Copy `libzmq.dll` into the `MQL4/Libraries` folder.
       - Copy `zmq.mqh` into the `MQL4/Include` folder.

    3. Enable DLL Imports in MT4:
       - Go to "Tools" -> "Options" -> "Expert Advisors" tab.
       - Check the box for "Allow DLL imports".

    4. Compile this file in MetaEditor and attach it to a chart.
*/

#include <zmq.mqh>
#include <StringUtils.mqh> // We will create this helper file for string splitting

// ZMQ DLL functions import
#import "libzmq.dll"
  int zmq_errno();
  string zmq_strerror(int errnum);
#import

// --- EA Inputs
input string ZMQ_Host      = "localhost";
input int    ZMQ_Port      = 5555; // Must match the port in the Python script

// --- Global variables
int  h_context = -1;
int  h_socket = -1;
string subscribed_symbol = ""; // Symbol for tick data subscription

// --- Alert Structure and storage ---
struct PriceAlert
{
    string Symbol;
    int    Condition; // 0 for greater than (>), 1 for less than (<)
    double Price;
};
PriceAlert Alerts[];
int total_alerts = 0;

void SendFeedback(string message);

// Placeholder for trade execution
void ExecuteTrade(string symbol, int type, double volume, double sl, double tp);
void HandleAlerts();

//+------------------------------------------------------------------+
//| Expert initialization function                                   |
//+------------------------------------------------------------------+
int OnInit()
{
    Print("Initializing PyConnector EA v2.0...");
    ArrayResize(Alerts, 0); // Initialize alerts array

    // Initialize ZMQ context
    h_context = zmq_ctx_new();
    if (h_context < 0)
    {
        Print("Error creating ZMQ context: ", zmq_strerror(zmq_errno()));
        return(INIT_FAILED);
    }
    Print("ZMQ context created.");

    // Create a DEALER (async client) socket
    h_socket = zmq_socket(h_context, ZMQ_DEALER);
    if (h_socket < 0)
    {
        Print("Error creating ZMQ socket: ", zmq_strerror(zmq_errno()));
        zmq_ctx_destroy(h_context);
        return(INIT_FAILED);
    }
    Print("ZMQ DEALER socket created.");
    
    // Connect to the Python ZMQ server
    string endpoint = "tcp://" + ZMQ_Host + ":" + (string)ZMQ_Port;
    int rc = zmq_connect(h_socket, endpoint);
    if (rc < 0)
    {
        Print("Error connecting ZMQ socket to ", endpoint, ": ", zmq_strerror(zmq_errno()));
        zmq_close(h_socket);
        zmq_ctx_destroy(h_context);
        return(INIT_FAILED);
    }
    
    Print("Successfully connected to Python server at ", endpoint);
    
    // Set up a timer to check for messages periodically
    EventSetTimer(1); // Timer event every 1 second
    
    // Send a startup message to Python so it knows our identity
    SendFeedback("INFO|EA_STARTED|" + Symbol());
    
    return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                 |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
    Print("Deinitializing PyConnector EA...");
    EventKillTimer();
    
    if (h_socket >= 0)
    {
        zmq_close(h_socket);
        Print("ZMQ socket closed.");
    }
    if (h_context >= 0)
    {
        zmq_ctx_destroy(h_context);
        Print("ZMQ context destroyed.");
    }
}

//+------------------------------------------------------------------+
//| Timer function                                                   |
//+------------------------------------------------------------------+
void OnTimer()
{
    string received_message;
    
    // Check for incoming messages, don't wait/block
    int bytes_received = zmq_recv(h_socket, received_message, 1024, ZMQ_DONTWAIT);
    
    if (bytes_received > 0)
    {
        Print("Received command from Python: ", received_message);
        // We have a message, now parse and handle it
        ParseCommand(received_message);
    }
    else if (bytes_received < 0 && zmq_errno() != EAGAIN) // EAGAIN means no message available, which is normal
    {
        Print("Error receiving ZMQ message: ", zmq_strerror(zmq_errno()));
    }
}

//+------------------------------------------------------------------+
//| Command Parser                                                   |
//+------------------------------------------------------------------+
void ParseCommand(string command)
{
    // Command Format Examples:
    // "TRADE|OPEN|BUY|EURUSD|0.01|0|0"
    // "ALERT|SET|EURUSD|>|1.12345"
    // "TICK|SUBSCRIBE|EURUSD"
    
    string parts[];
    int count = StringSplit(command, '|', parts);
    
    if(count < 2)
    {
        Print("Invalid command format: ", command);
        return;
    }
    
    string topic = parts[0];

    // --- TRADE Command ---
    if (topic == "TRADE" && count >= 7)
    {
        string action = parts[1];
        if (action == "OPEN")
        {
            // Note: MQL4 string to number conversion can be tricky.
            // StringToInteger and StringToDouble are reliable.
            string trade_type_str = parts[2];
            string symbol = parts[3];
            double volume = StringToDouble(parts[4]);
            double sl = StringToDouble(parts[5]);
            double tp = StringToDouble(parts[6]);
            int trade_type = -1;
            if (trade_type_str == "BUY") trade_type = OP_BUY;
            if (trade_type_str == "SELL") trade_type = OP_SELL;
            if (trade_type != -1 && volume > 0) ExecuteTrade(symbol, trade_type, volume, sl, tp);
        }
    }
    // --- ALERT Command ---
    else if (topic == "ALERT" && count >= 5)
    {
        string action = parts[1];
        if (action == "SET")
        {
            total_alerts++;
            ArrayResize(Alerts, total_alerts);
            PriceAlert alert;
            alert.Symbol = parts[2];
            alert.Condition = (parts[3] == ">" ? 0 : 1);
            alert.Price = StringToDouble(parts[4]);
            Alerts[total_alerts - 1] = alert;
            
            SendFeedback("INFO|ALERT_SET|" + alert.Symbol + "|" + parts[3] + "|" + DoubleToString(alert.Price));
        }
    }
    // --- TICK Command ---
    else if (topic == "TICK" && count >= 3)
    {
        string action = parts[1];
        if (action == "SUBSCRIBE")
        {
            subscribed_symbol = parts[2];
            SendFeedback("INFO|SUBSCRIBED|" + subscribed_symbol);
        }
    }
    else
    {
        Print("Unknown or malformed command: ", command);
    }
}

//+------------------------------------------------------------------+
//| Trade Execution                                                  |
//+------------------------------------------------------------------+
void ExecuteTrade(string symbol, int type, double volume, double sl_price, double tp_price)
{
    // --- Parameters ---
    int slippage = 3;      // Slippage in points
    int magic_number = 12345; // Magic number to identify trades from this EA
    
    // --- Price Calculation ---
    double price = 0;
    if(type == OP_BUY)
    {
        price = SymbolInfoDouble(symbol, SYMBOL_ASK);
    }
    else if(type == OP_SELL)
    {
        price = SymbolInfoDouble(symbol, SYMBOL_BID);
    }
    
    if(price == 0)
    {
        Print("Could not retrieve market price for ", symbol);
        return;
    }

    // --- Normalize SL/TP ---
    // If SL/TP are passed as 0, they are not used.
    // If they are non-zero, they are treated as absolute prices.
    int digits = (int)SymbolInfoInteger(symbol, SYMBOL_DIGITS);
    if(sl_price != 0)
    {
        sl_price = NormalizeDouble(sl_price, digits);
    }
    if(tp_price != 0)
    {
        tp_price = NormalizeDouble(tp_price, digits);
    }

    // --- Send Order ---
    Print("Executing OrderSend: ",
          "Symbol=", symbol,
          ", Type=", IntegerToString(type),
          ", Volume=", DoubleToString(volume),
          ", Price=", DoubleToString(price, digits),
          ", SL=", DoubleToString(sl_price, digits),
          ", TP=", DoubleToString(tp_price, digits)
         );

    int ticket = OrderSend(
        symbol,         // Symbol
        type,           // Operation (OP_BUY or OP_SELL)
        volume,         // Volume
        price,          // Price
        slippage,       // Slippage
        sl_price,       // Stop Loss
        tp_price,       // Take Profit
        "Sent from Python", // Comment
        magic_number,   // Magic Number
        0,              // No expiration
        clrGreen        // Arrow color
    );
    
    // --- Check Result ---
    if(ticket < 0)
    {
        int error = GetLastError();
        string error_msg = ErrorDescription(error);
        Print("OrderSend failed with error code: ", error, " - ", error_msg);
        // Send failure feedback to Python
        SendFeedback("FEEDBACK|FAILURE|OrderSend failed: " + error_msg);
    }
    else
    {
        Print("OrderSend successful. Ticket: ", ticket);
        // Send success feedback to Python
        SendFeedback("FEEDBACK|SUCCESS|Order placed successfully. Ticket: " + IntegerToString(ticket));
    }
}

//+------------------------------------------------------------------+
//| Send Feedback to Python                                          |
//+------------------------------------------------------------------+
void SendFeedback(string message)
{
    if(h_socket < 0) return;
    
    int bytes_sent = zmq_send(h_socket, message, ZMQ_DONTWAIT);
    if(bytes_sent < 0 && zmq_errno() != EAGAIN)
    {
        Print("Error sending feedback to Python: ", zmq_strerror(zmq_errno()));
    }
    else
    {
        Print("Sent to Python: ", message);
    }
}

//+------------------------------------------------------------------+
//| Tick function (Now active!)                                      |
//+------------------------------------------------------------------+
void OnTick()
{
    // 1. Handle price alerts
    HandleAlerts();
    
    // 2. Stream tick data if a symbol is subscribed
    if (Symbol() == subscribed_symbol)
    {
        double bid = SymbolInfoDouble(Symbol(), SYMBOL_BID);
        double ask = SymbolInfoDouble(Symbol(), SYMBOL_ASK);
        string message = "TICK|DATA|" + Symbol() + "|" + DoubleToString(bid, _Digits) + "|" + DoubleToString(ask, _Digits);
        SendFeedback(message);
    }
}
//+------------------------------------------------------------------+

//+------------------------------------------------------------------+
//| Alert Handler                                                    |
//+------------------------------------------------------------------+
void HandleAlerts()
{
    if (total_alerts == 0) return;

    double current_price = SymbolInfoDouble(Symbol(), SYMBOL_ASK); // Use Ask for checks

    for (int i = total_alerts - 1; i >= 0; i--)
    {
        if (Alerts[i].Symbol == Symbol())
        {
            bool triggered = false;
            // Condition 0: Price should be > alert price
            if (Alerts[i].Condition == 0 && current_price > Alerts[i].Price)
            {
                triggered = true;
            }
            // Condition 1: Price should be < alert price
            else if (Alerts[i].Condition == 1 && current_price < Alerts[i].Price)
            {
                triggered = true;
            }

            if (triggered)
            {
                string condition_str = (Alerts[i].Condition == 0 ? ">" : "<");
                SendFeedback("ALERT|TRIGGERED|" + Alerts[i].Symbol + " price is now " + condition_str + " " + DoubleToString(Alerts[i].Price));
                
                // Remove the triggered alert to avoid repeated firing
                for (int j = i; j < total_alerts - 1; j++)
                {
                    Alerts[j] = Alerts[j + 1];
                }
                total_alerts--;
                ArrayResize(Alerts, total_alerts);
            }
        }
    }
}
