/**
 * Gemini API 用量统计脚本 for Quantumult X
 * * 说明：本脚本通过拦截 Gemini API 的响应，自动累加 token 使用量并记录。
 * * [rewrite_local]
 * ^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\/gemini.*$ url script-response-body https://raw.githubusercontent.com/你的路径/gemini_usage.js
 * * [mitm]
 * hostname = generativelanguage.googleapis.com
 */

const key = "Gemini_Usage_Stats";
let stats = $prefs.valueForKey(key) ? JSON.parse($prefs.valueForKey(key)) : {
    total_tokens: 0,
    prompt_tokens: 0,
    candidates_tokens: 0,
    request_count: 0,
    last_update: ""
};

if ($response.body) {
    try {
        let obj = JSON.parse($response.body);
        // Gemini API 返回的结构通常包含 usageMetadata
        if (obj.usageMetadata) {
            let usage = obj.usageMetadata;
            
            stats.total_tokens += usage.totalTokenCount || 0;
            stats.prompt_tokens += usage.promptTokenCount || 0;
            stats.candidates_tokens += usage.candidatesTokenCount || 0;
            stats.request_count += 1;
            stats.last_update = new Date().toLocaleString();

            $prefs.setValueForKey(JSON.stringify(stats), key);

            $notify("Gemini 用量统计", 
                `本次消耗: ${usage.totalTokenCount} tokens`, 
                `累计使用: ${stats.total_tokens} | 次数: ${stats.request_count}\n更新于: ${stats.last_update}`
            );
        }
    } catch (e) {
        console.log("Gemini 统计脚本解析失败: " + e);
    }
}

$done({body: $response.body});
