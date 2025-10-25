# scripts

仓库用途：存放 各种各样的脚本（包括 sing-box 订阅转换模板等），便于集中管理与复用。

## 已包含脚本

### [sing-box/template.js](https://raw.githubusercontent.com/showchi/scripts/refs/heads/main/sub-store/template.js)
用途：将 sing-box 订阅节点按规则插入到指定的 `outbound` 中，供 sub-store 在生成/转换配置时使用。

主要特性：
- 支持任意数量的额外参数，除 `type`、`name`、`url`、`includeUnsupportedProxy` 外的所有参数均视为 outbound 映射规则并参与解析。
- 支持两种 outbound 规则格式：
  - JSON 映射（推荐）：键为一个或多个用 `|` 分隔的 outbound 标签，值为正则表达式（支持 `/pattern/flags`）。
    - 例如：`{"ALL|ALL-Auto":"/.*?/i","HK|HK-Auto":"/港|hk/i"}`
  - 简洁格式（key=value 列表）：用 `🕳` 分隔多个对，`|` 表示多个目标 outbound。
    - 例如：`ALL|ALL-Auto=/.*?/i🕳HK|HK-Auto=/港|hk/i`
- pattern 直接解释为正则：支持 `/pattern/flags` 或直接的正则字符串。
- 若目标 `outbound` 的 `outbounds` 为空，会自动插入 `COMPATIBLE (direct)` 以避免报错。

参数说明：
- type: 订阅类型，`collection`（组合订阅）或 `subscription`（默认）
- name: 订阅名称
- url: 可选，远程订阅链接（请用 `encodeURIComponent` 编码）
- includeUnsupportedProxy: 是否包含不支持协议（布尔）
- 其余参数视为 outbound 映射规则（JSON 字符串或 key=value 列表）

快速示例（URL 编码后可作为 sub-store 链接片段）：

- JSON 映射（示例参数需做 URL 编码）：
  ```
  # 参数（未编码示例）
  type=组合订阅
  name=机场
  outbound_rules={"ALL|ALL-Auto":"/.*/i","HK|HK-Auto":"/港|hk/i"}
  ```

- 简洁格式（示例，使用 🕳 分隔）：
  ```
  type=组合订阅&name=机场&ALL|ALL-Auto=/.*/i🕳HK|HK-Auto=/港|hk/i
  ```

输出：
- 将修改后的 sing-box 配置 JSON 写入 `$content`（供 sub-store 使用）。
