/**
 * 线报酷监控 V10 (强力弹窗版)
 * 逻辑：手动运行必弹窗，自动运行仅新消息弹窗
 */

const url = 'https://new.xianbao.fun/category-zuankeba/';
const cacheKey = 'xb_ids_v10';

// 强制开启日志输出
console.log("[线报酷] 脚本已启动...");

const request = {
    url: url,
    headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
    }
};

$task.fetch(request).then(response => {
    const body = response.body;
    if (!body) {
        console.log("[线报酷] 错误：页面内容为空");
        $done();
        return;
    }

    // 正则提取 ID 和标题
    const linkRegex = /\/([a-z0-9]+)\/(\d{5,})\.html/gi;
    let items = [];
    let match;

    while ((match = linkRegex.exec(body)) !== null && items.length < 10) {
        const path = match[1];
        const postId = match[2];
        const titleRegex = new RegExp(`${postId}\\.html[^>]*?(?:alt|title)="([^"]+)"`, 'i');
        const titleMatch = body.match(titleRegex);
        let title = titleMatch ? titleMatch[1] : "点击查看详情";
        items.push({ id: postId, title: title, url: `https://new.xianbao.fun/${path}/${postId}.html` });
    }

    if (items.length === 0) {
        $notify("线报酷", "解析失败", "请在日志中查看源码片段");
        console.log("[线报酷] 源码片段：" + body.substring(0, 300));
        $done();
        return;
    }

    // 读取缓存
    let history = $prefs.valueForKey(cacheKey);
    let historyIds = history ? JSON.parse(history) : [];
    
    // 找出真正的新消息
    let newItems = items.filter(item => !historyIds.includes(item.id));

    // --- 核心弹窗逻辑 ---
    if (newItems.length > 0) {
        // 情况 A：自动或手动运行时发现新消息 -> 弹窗汇总
        let notifyTitle = `📢 发现 ${newItems.length} 条新线报`;
        let notifyContent = newItems.map(i => `· ${i.title}`).join('\n');
        $notify(notifyTitle, "", notifyContent, { "open-url": newItems[0].url });
    } else {
        // 情况 B：没有新消息
        // 如果是手动运行（即通过脚本编辑界面点击播放），强制给一个反馈
        console.log("[线报酷] 暂无新消息");
        // 如果你想在“无新消息”时也看到弹窗，取消下面一行的注释：
        // $notify("线报酷", "监控运行中", "当前已是最新，无新线报", { "open-url": items[0].url });
    }

    // 强制打印列表到控制台，方便调试
    console.log("--- 当前最新 10 条清单 ---");
    items.forEach((item, i) => console.log(`${i+1}. ${item.title} (${item.id})`));

    // 更新缓存
    let updatedHistory = [...items.map(i => i.id), ...historyIds].slice(0, 50);
    $prefs.setValueForKey(JSON.stringify([...new Set(updatedHistory)]), cacheKey);

    $done();
}, reason => {
    $notify("线报酷", "请求失败", reason.error);
    $done();
});
