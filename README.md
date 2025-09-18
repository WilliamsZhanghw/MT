# MT4 Python 控制软件

这是一个使用 Python 和 MQL4 开发的，用于控制 MetaTrader 4 (MT4) 进行交易的软件。

## 技术栈

*   **Python 端**:
    *   `PyQt6`: 用于构建图形用户界面 (GUI)。
    *   `pyzmq`: 用于实现 Python 和 MT4 EA 之间的高性能、低延迟通信。
*   **MT4 端**:
    *   `MQL4`: MT4 的原生编程语言，用于编写 Expert Advisor (EA)。
    *   `ZMQ EA Connector`: 一个在 MQL4 中与 ZeroMQ 通信的EA。

## 项目结构

```
/
├── mql4_ea/
│   └── PyConnector.mq4       # 运行在MT4中的EA，负责接收指令和执行交易
├── python_ui/
│   ├── main.py               # Python主程序，包含GUI和业务逻辑
│   └── requirements.txt      # Python依赖包列表
└── README.md                 # 项目说明文件
```

## 工作原理

1.  **启动 Python 程序**: 运行 `main.py`，程序会启动一个 ZeroMQ 服务端，并监听特定端口。
2.  **启动 MT4 EA**: 将 `PyConnector.mq4` 附加到 MT4 的任意图表上。EA启动后会作为 ZeroMQ 客户端连接到 Python 程序的服务端。
3.  **发送指令**: 在 Python GUI 中进行操作（如点击“买入”按钮）。
4.  **执行交易**: GUI 的操作会通过 ZeroMQ 发送一个格式化的消息到 MT4 EA。EA接收并解析消息，然后调用 MQL4 的 `OrderSend()` 函数来执行相应的交易操作。
5.  **返回结果**: EA执行操作后，可以将结果（如成功、失败、订单号）通过 ZeroMQ 回传给 Python 程序，并在GUI上显示。
