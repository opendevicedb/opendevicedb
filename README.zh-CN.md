[English](README.md) | 简体中文

> 本文为 [英文 README](README.md) 的中文译本，如有出入，以英文版为准。译文借助 AI 辅助完成并经过审校，欢迎通过 pull request 提交修正。

# OpenDeviceDB

[![Website](https://img.shields.io/badge/website-opendevicedb.org-1f4fc4)](https://opendevicedb.org)
[![npm](https://img.shields.io/npm/v/@opendevicedb/mcp?label=MCP%20server)](https://www.npmjs.com/package/@opendevicedb/mcp)
[![Code: AGPL-3.0](https://img.shields.io/badge/code-AGPL--3.0-blue)](LICENSE)
[![Data: CC BY-SA 4.0](https://img.shields.io/badge/data-CC%20BY--SA%204.0-green)](LICENSE-DATA.md)

一个开放的设备目录，收录协议或固件已被逆向工程的设备，
让任何人（无论是人类还是 AI 智能体）都不必重复已经完成的工作。

- **人类用户**：在网站（`site/`）上浏览目录、设备页面和新闻。
- **安装途径与设备识别**：设备页面列出了安装开源固件的方法（官方指南、难度、风险）；
  [/detect/](https://opendevicedb.org/detect/) 可直接在浏览器中，通过 USB ID 或蓝牙名称
  识别已插入或附近的设备。
- **自由程度**：每个项目都注明哪些部分仍是非自由的（厂商二进制文件、基带、Wi-Fi 等），
  以及是否仍需厂商云服务；目录可筛选无需云服务即可使用的设备。
- **AI 智能体**：在开始逆向工程任务之前，先通过 MCP 服务器（`packages/mcp`）查询，
  认领该设备，完成后发布研究成果。
- **现有数据库**（目前共 30 个：OpenWrt、Zigbee2MQTT、Z-Wave JS、Tasmota、ESPHome、
  tuya-local、OpenRGB、libgphoto2、LineageOS、postmarketOS/Nura、coreboot、rtl_433、
  Gadgetbridge、Klipper、Marlin、Rockbox、Valetudo、thingino、tuya-cloudcutter、QMK、SANE、OpenPrinting、libwacom、Betaflight、EdgeTX，以及相机方面的 Magic Lantern、OpenMemories、pktriggercord、Fujihack 和智能手表方面的 AsteroidOS……）由导入器
  （`packages/importers`）汇总，并附有指向各数据源的链接。

如果它对你有帮助，点一个 ⭐ 可以让使用同款设备的人更容易找到它。

贡献不必完整：关于某个协议的一条经过验证的事实（一个 BLE 特征值、一种校验和、UART 引脚定义），
都能帮助下一个人或智能体更快推进。参见
[参与贡献](https://opendevicedb.org/contribute/#partial)。

设计说明见 [SPEC.md](SPEC.md)，收录标准见 [POLICY.md](POLICY.md)。

```sh
npm install
npm run validate        # check every record against schema/device.schema.json
npm run import -- all   # refresh data/imported/ snapshots
npm run dev             # website on localhost
npm run mcp             # MCP server on stdio
```

代码：AGPL-3.0-or-later（见 LICENSE）。数据：CC BY-SA 4.0（见 LICENSE-DATA.md）。
