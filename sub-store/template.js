/*
sing-box 订阅转换模板脚本
用途：处理订阅节点并按规则插入到指定的 outbound 中

支持的参数：
1. 基础参数
- type: 订阅类型，可选值：组合订阅/collection 或 subscription(默认)
- name: 订阅名称
- url: 订阅链接（可选），需要 encodeURIComponent 编码
- includeUnsupportedProxy: 是否包含不支持的协议（如 SSR），默认 false

2. outbound 映射参数
除上述基础参数外的所有参数都会被视为 outbound 映射规则，支持两种格式：

a) JSON 格式（推荐）：
   例如：
   {
     "outbound_rules": {
       "ALL|ALL-Auto": "/.*?/i",
       "HK|HK-Auto": "/港|hk|hongkong|🇭🇰/i",
       "JP|JP-Auto": "/日本|jp|japan|🇯🇵/i"
     }
   }

b) 简单格式：
   outbound1|outbound2=pattern[🕳outbound3=pattern]...
   例如：ALL|ALL-Auto=/.*?/i🕳HK|HK-Auto=/港|hk/i

注意事项：
1. outbound 支持使用 | 分隔多个目标，如 "HK|HK-Auto"
2. pattern 支持完整的正则表达式语法：
   - 使用 /pattern/flags 格式，如 /港|hk/i
   - 直接使用正则字符串，将自动构造 RegExp 对象
3. 空的 outbounds 会自动插入 COMPATIBLE(direct) 以避免报错

示例用法：

1. 基础用法：
type=组合订阅&name=测试&outbound_rules=%7B%22ALL%22%3A%22%2F.*%3F%2Fi%22%7D

2. 完整用法（JSON格式）：
type=组合订阅&name=机场&url=http%3A%2F%2Fexample.com&includeUnsupportedProxy=true&outbound_rules=%7B%22ALL%7CALL-Auto%22%3A%22%2F.*%3F%2Fi%22%2C%22HK%7CHK-Auto%22%3A%22%2F%E6%B8%AF%7Chk%2Fi%22%7D

3. 完整用法（简单格式）：
type=组合订阅&name=机场&url=http%3A%2F%2Fexample.com&ALL%7CALL-Auto=%2F.*%3F%2Fi&HK%7CHK-Auto=%2F%E6%B8%AF%7Chk%2Fi
*/

// 示例 URL（更新后的格式）：
// https://raw.githubusercontent.com/example/sing-box/template.js#type=组合订阅&name=机场&outbound_rules=%7B%22ALL%7CALL-Auto%22%3A%22%2F.*%3F%2Fi%22%2C%22HK%7CHK-Auto%22%3A%22%2F%E6%B8%AF%7Chk%2Fi%22%7D

// 注意：请根据实际情况修改示例 URL 中的参数值

log(`🚀 开始`)

let { type, name, includeUnsupportedProxy, url, ...otherArgs } = $arguments;

// 将其他参数合并为一个 outbound 字符串
const outbound = Object.entries(otherArgs)
  .map(([key, value]) => `${key}=${value}`)
  .join('🕳'); // 使用 '🕳' 分隔符连接所有额外的参数

log(`传入参数 type: ${type}, name: ${name}, includeUnsupportedProxy: ${includeUnsupportedProxy}, url: ${url}, outbound: ${outbound}`)

type = /^1$|col|组合/i.test(type) ? 'collection' : 'subscription'

const parser = ProxyUtils.JSON5 || JSON
log(`① 使用 ${ProxyUtils.JSON5 ? 'JSON5' : 'JSON'} 解析配置文件`)
let config
try {
  config = parser.parse($content ?? $files[0])
} catch (e) {
  log(`${e.message ?? e}`)
  throw new Error(`配置文件不是合法的 ${ProxyUtils.JSON5 ? 'JSON5' : 'JSON'} 格式`)
}
log(`② 获取订阅`)

let proxies
if (url) {
  log(`直接从 URL ${url} 读取订阅`)
  proxies = await produceArtifact({
    name,
    type,
    platform: 'sing-box',
    produceType: 'internal',
    produceOpts: {
      'include-unsupported-proxy': includeUnsupportedProxy,
    },
    subscription: {
      name,
      url,
      source: 'remote',
    },
  })
} else {
  log(`将读取名称为 ${name} 的 ${type === 'collection' ? '组合' : ''}订阅`)
  proxies = await produceArtifact({
    name,
    type,
    platform: 'sing-box',
    produceType: 'internal',
    produceOpts: {
      'include-unsupported-proxy': includeUnsupportedProxy,
    },
  })
}

log(`③ outbound 规则解析`)
const outbounds = []
try {
  const trimmed = (outbound || '').trim();
  if (!trimmed) {
    log('outbound 参数为空，跳过 outbound 映射');
  } else if (trimmed.startsWith('{')) {
    // JSON 映射：{"outboundPattern":"tagPattern", ...}
    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch (e) {
      throw new Error('outbound 参数以 { 开头但不是合法 JSON');
    }
    if (Array.isArray(parsed)) {
      parsed.forEach(item => {
        if (item && typeof item === 'object') {
          Object.entries(item).forEach(([k, v]) => {
            const outboundPatterns = k.split('|'); // 支持多个 outboundPattern
            outboundPatterns.forEach(outboundPattern => {
              outbounds.push([outboundPattern, createTagRegExp(String(v ?? '.*'))]);
            });
          });
        }
      });
    } else {
      Object.entries(parsed).forEach(([k, v]) => {
        const outboundPatterns = k.split('|'); // 支持多个 outboundPattern
        outboundPatterns.forEach(outboundPattern => {
          outbounds.push([outboundPattern, createTagRegExp(String(v ?? '.*'))]);
        });
      });
    }
  } else {
    // 简洁的 key=value 列表，用 '🕳' 分隔多对，例如:
    // "hk|hk-auto=港|hk🕳jp|jp-auto=日本|jp"
    trimmed
      .split('🕳')
      .filter(Boolean)
      .forEach(segment => {
        const idx = segment.indexOf('=');
        let outboundPattern = segment;
        let tagPattern = '.*';
        if (idx >= 0) {
          outboundPattern = segment.slice(0, idx);
          tagPattern = segment.slice(idx + 1) || '.*';
        }
        const outboundPatterns = outboundPattern.split('|'); // 支持多个 outboundPattern
        outboundPatterns.forEach(pattern => {
          outbounds.push([pattern, createTagRegExp(tagPattern)]);
        });
      });
  }

  outbounds.forEach(([outboundPattern, tagRegex]) => {
    log(`匹配 ${tagRegex} 的节点将插入匹配 ${createOutboundRegExp(outboundPattern)} 的 outbound 中`);
  });
} catch (e) {
  log(`解析 outbound 失败: ${e.message ?? e}`);
  throw e;
}

log(`④ outbound 插入节点`)
config.outbounds.map(outbound => {
  outbounds.map(([outboundPattern, tagRegex]) => {
    const outboundRegex = createOutboundRegExp(outboundPattern)
    if (outboundRegex.test(outbound.tag)) {
      if (!Array.isArray(outbound.outbounds)) {
        outbound.outbounds = []
      }
      const tags = getTags(proxies, tagRegex)
      log(`🕳 ${outbound.tag} 匹配 ${outboundRegex}, 插入 ${tags.length} 个 🏷 匹配 ${tagRegex} 的节点`)
      outbound.outbounds.push(...tags)
    }
  })
})

const compatible_outbound = {
  tag: 'COMPATIBLE',
  type: 'direct',
}

let compatible
log(`⑤ 空 outbounds 检查`)
config.outbounds.map(outbound => {
  outbounds.map(([outboundPattern, tagRegex]) => {
    const outboundRegex = createOutboundRegExp(outboundPattern)
    if (outboundRegex.test(outbound.tag)) {
      if (!Array.isArray(outbound.outbounds)) {
        outbound.outbounds = []
      }
      if (outbound.outbounds.length === 0) {
        if (!compatible) {
          config.outbounds.push(compatible_outbound)
          compatible = true
        }
        log(`🕳 ${outbound.tag} 的 outbounds 为空, 自动插入 COMPATIBLE(direct)`)
        outbound.outbounds.push(compatible_outbound.tag)
      }
    }
  })
})

config.outbounds.push(...proxies)

$content = JSON.stringify(config, null, 2)

function getTags(proxies, regex) {
  return (regex ? proxies.filter(p => regex.test(p.tag)) : proxies).map(p => p.tag)
}
function log(v) {
  console.log(`[📦 sing-box 模板脚本] ${v}`)
}
// 解析支持 /pattern/flags 的正则字面量，也支持直接写 pattern（无 flags）
function parsePattern(pattern) {
  if (!pattern) return /.*/
  if (pattern.startsWith('/') && pattern.lastIndexOf('/') > 0) {
    const lastSlash = pattern.lastIndexOf('/')
    const body = pattern.slice(1, lastSlash)
    const flags = pattern.slice(lastSlash + 1)
    return new RegExp(body, flags)
  }
  return new RegExp(pattern)
}
function createTagRegExp(tagPattern) {
  return parsePattern(tagPattern)
}
function createOutboundRegExp(outboundPattern) {
  return parsePattern(outboundPattern)
}

log(`🔚 结束`)
