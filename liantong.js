/*
 * 中国联通 QX 版 (框架增强版)
 * 账号格式仅支持: token_online#appId
 * 多账号: 使用 & 或换行分隔
 */

const $ = new Env("中国联通合集-QX");

const KEY = {
  COOKIE: "chinaUnicomCookie",
  GRAB: "chinaUnicomCookie_grab"
};

const UA_APP = "Dalvik/2.1.0 (Linux; U; Android 12; Mi 10 Pro MIUI/21.11.3);unicom{version:android@11.0802}";
const UA_IOS = "ChinaUnicom4.x/12.11 (com.chinaunicom.mobilebusiness; build:36; iOS 26.0.1) Alamofire/4.7.3 unicom{version:iphone_c@12.1100}";
const WOCARE = {
  serviceLife: "wocareMBHServiceLife1",
  channelId: "beea1c7edf7c4989b2d3621c4255132f",
  signKey: "f4cd4ffeb5554586acf65ba7110534f5",
  version: "1"
};

// 与 python 的 globalConfig 对齐（QX 可手改）
const globalConfig = {
  enable_sign: true,
  enable_ltzf: true,
  enable_ttlxj: true,
  enable_market: true,
  enable_security: true,
  enable_ltyp: true,
  enable_woread: false,
  enable_aiting: true,
  enable_wostore: true,
  enable_regional: true
};

if (typeof $request !== "undefined") {
  captureToken();
} else {
  !(async () => {
    await main();
  })()
    .catch((e) => $.logErr(e))
    .finally(() => $.done());
}

function captureToken() {
  try {
    const url = $request.url || "";
    const body = $request.body || "";
    if (!url.includes("onLine.htm") || !body) return $.done({});

    const token = body.match(/token_online=([^&]*)/)?.[1];
    const appId = body.match(/appId=([^&]*)/)?.[1];
    if (!token) return $.done({});

    const value = `${token}#${appId || ""}`;
    $.setdata(value, KEY.GRAB);
    $.msg($.name, "抓包成功", "已保存 token_online#appId 到 chinaUnicomCookie_grab");
  } catch (e) {
    $.logErr(e);
  }
  $.done({});
}

async function main() {
  const raw = $.getdata(KEY.COOKIE);
  if (!raw) {
    $.msg($.name, "未配置账号", `请先在 QX 设置 ${KEY.COOKIE}`);
    return;
  }

  const accounts = raw.split(/[&\n]/).map((x) => x.trim()).filter(Boolean);
  $.log(`共读取 ${accounts.length} 个账号`);
  let successCount = 0;

  for (let i = 0; i < accounts.length; i++) {
    const idx = i + 1;
    $.log(`\n================ 账号[${idx}] ================`);

    try {
      const conf = parseAccount(accounts[i]);
      const onlineRes = await verifyOnline(conf.token, conf.appId);
      if (!onlineRes.ok) {
        $.log(`账号[${idx}] 授权失败: ${onlineRes.msg || "token可能已失效"}`);
        continue;
      }

      const session = buildSession(idx, conf, onlineRes.data);
      $.log(`账号[${idx}] 授权成功: ${mask(session.mobile)}`);

      if (conf.token && conf.appId) {
        $.setdata(`${conf.token}#${conf.appId}`, `${KEY.COOKIE}_last_${idx}`);
      }

      await executeDailyTasks(session);
      successCount += 1;

      $.msg(
        `${$.name} 账号[${idx}]`,
        `✅ 执行完成 ${mask(session.mobile)}`,
        session.logs.slice(0, 3).join(" | ") || "任务已执行"
      );
    } catch (e) {
      $.log(`账号[${idx}] 异常: ${e.message || e}`);
    }
  }
  $.msg($.name, "脚本执行完成", `总账号: ${accounts.length}，执行完成: ${successCount}`);
}

function buildSession(index, conf, onlineData) {
  const unicomTokenId = randomHex(32);
  const tokenIdCookie = `chinaunicom-${randomHex(32).toUpperCase()}`;
  const cityInfo = onlineData?.list || [];
  const cityNum = (cityInfo.find((x) => /^1\d{10}$/.test(String(x?.num || ""))) || {}).num || "";
  const desmobile = String(onlineData?.desmobile || "");
  const mobile = /^1\d{10}$/.test(desmobile) ? desmobile : (conf.mobile || cityNum || "");
  return {
    index,
    token: conf.token,
    appId: conf.appId,
    ecs_token: onlineData?.ecs_token || "",
    mobile,
    cityInfo,
    onlineData,
    logs: [],
    unicomTokenId,
    tokenIdCookie,
    epayCookie: ""
  };
}

async function executeDailyTasks(session) {
  // 1 首页签到
  if (globalConfig.enable_sign) {
    await signModule(session);
  }

  // 2 联通祝福
  if (globalConfig.enable_ltzf) {
    await ltzfModule(session);
  }

  // 3 天天领现金
  if (globalConfig.enable_ttlxj) {
    await ttlxjModule(session);
  }

  // 4 权益超市
  if (globalConfig.enable_market) {
    await marketModule(session);
  }

  // 5 安全管家
  if (globalConfig.enable_security) {
    await securityModule(session);
  }

  // 6 联通云盘
  if (globalConfig.enable_ltyp) {
    await cloudDiskModule(session);
  }

  // 7 联通阅读
  if (globalConfig.enable_woread) {
    await woreadModule(session);
  }

  // 8 联通爱听
  if (globalConfig.enable_aiting) {
    await aitingModule(session);
  }

  // 9 沃云手机
  if (globalConfig.enable_wostore) {
    await wostoreModule(session);
  }

  // 10 区域专区
  if (globalConfig.enable_regional) {
    await regionalModule(session);
  }
}

// ===== 1 首页签到（可执行实现） =====
async function signModule(session) {
  pushLog(session, "[首页签到] 开始");

  try {
    const state = await signGetContinuous(session);
    if (!state.ok) {
      pushLog(session, `[首页签到] 查询失败: ${state.msg}`);
      return;
    }

    if (state.todaySigned) {
      pushLog(session, "[首页签到] 今日已签到");
      return;
    }

    const doSign = await signDaySign(session);
    if (doSign.ok) pushLog(session, `[首页签到] ${doSign.msg}`);
    else pushLog(session, `[首页签到] 失败: ${doSign.msg}`);
  } catch (e) {
    pushLog(session, `[首页签到] 异常: ${e.message || e}`);
  }
}

async function signGetContinuous(session) {
  const req = {
    url: "https://activity.10010.com/sixPalaceGridTurntableLottery/signin/getContinuous?taskId=&channel=wode&imei=" + encodeURIComponent(randomString(32)),
    method: "GET",
    headers: withEcsTokenHeaders(session, UA_APP)
  };

  const res = await http(req);
  if (!res.ok) return { ok: false, msg: res.msg || "网络失败" };

  const json = safeJson(res.body);
  if (json.code !== "0000") {
    return { ok: false, msg: json.desc || json.msg || `code=${json.code || "unknown"}` };
  }

  const todaySigned = json?.data?.todayIsSignIn === "y";
  return { ok: true, todaySigned };
}

async function signDaySign(session) {
  const req = {
    url: "https://activity.10010.com/sixPalaceGridTurntableLottery/signin/daySign",
    method: "POST",
    headers: withEcsTokenHeaders(session, UA_APP),
    body: ""
  };

  const res = await http(req);
  if (!res.ok) return { ok: false, msg: res.msg || "网络失败" };

  const json = safeJson(res.body);
  if (json.code === "0000") {
    const d = json.data || {};
    return { ok: true, msg: `签到成功 ${d.statusDesc || ""}${d.redSignMessage || ""}`.trim() };
  }
  if (json.code === "0002" && String(json.desc || "").includes("已经签到")) {
    return { ok: true, msg: "今日已签到" };
  }

  return { ok: false, msg: json.desc || json.msg || `code=${json.code || "unknown"}` };
}

// ===== 2-10 功能入口（已接入执行流，后续逐模块补全完整逻辑） =====
async function ltzfModule(session) {
  pushLog(session, "[联通祝福] 开始");
  const base = "https://wocare.unisk.cn/mbh/getToken?channelType=wocareMBHServiceLife1&homePage=home&duanlianjieabc=qAz2m";
  const ticketRes = await openPlatLineNew(session, base);
  if (!ticketRes?.ticket) return pushLog(session, "[联通祝福] 获取 ticket 失败");

  const sid = await wocareGetSid(session, ticketRes.ticket);
  if (!sid) return pushLog(session, "[联通祝福] 获取 sid 失败");

  const token = await wocareLogin(session, sid);
  if (!token) return pushLog(session, "[联通祝福] 登录失败");

  const list = [
    { id: 2, name: "星座配对" },
    { id: 3, name: "大转盘" },
    { id: 4, name: "盲盒抽奖" }
  ];

  const dyn = await wocareGetSpecificityBanner(session, token);
  if (dyn.length) pushLog(session, `[联通祝福] 动态活动 ${dyn.length} 个`);

  for (const activity of dyn) {
    await wocareDoTasks(session, token, activity);
    await wocareDoDraw(session, token, activity);
  }

  for (const activity of list) {
    await wocareDoTasks(session, token, activity);
    await wocareDoDraw(session, token, activity);
  }
}

async function ttlxjModule(session) {
  pushLog(session, "[天天领现金] 开始");
  const ticketRes = await openPlatLineNew(session, "https://epay.10010.com/ci-mps-st-web/ttlxj/");
  if (!ticketRes?.ticket) return pushLog(session, "[天天领现金] 获取 ticket 失败");

  const authOk = await ttlxjAuthorize(session, ticketRes);
  if (!authOk) return pushLog(session, "[天天领现金] 授权失败");

  const authInfo = await ttlxjAuthCheck(session);
  if (!authInfo?.ok) return pushLog(session, `[天天领现金] authCheck失败: ${authInfo?.msg || "未知错误"}`);

  session.ttlxj = authInfo;
  await ttlxjDoClockIn(session);
  await ttlxjQueryAvailable(session);
}

async function marketModule(session) {
  pushLog(session, "[权益超市] 开始");
  const ticketRes = await openPlatLineNew(session, "https://contact.bol.wo.cn/market");
  if (!ticketRes?.ticket) return pushLog(session, "[权益超市] 获取 ticket 失败");

  const userToken = await marketGetUserToken(session, ticketRes.ticket);
  if (!userToken) return pushLog(session, "[权益超市] 获取 userToken 失败");

  await marketWateringTask(session, userToken);
  await marketDoTasks(session, userToken);
  await marketPrizeList(session, userToken);
  await marketDoRaffle(session, userToken);
}

async function securityModule(session) {
  pushLog(session, "[安全管家] 开始");
  const ticket = await getTicketByNative(session, "edop_unicom_3a6cc75a");
  if (!ticket) return pushLog(session, "[安全管家] 获取ticket失败");
  pushLog(session, `[安全管家] ticket已获取 ${String(ticket).slice(0, 8)}...`);
  // 轻量任务查询入口（完整积分链路依赖多层secret/signature）
  const res = await http({
    url: "https://m.jf.10010.com/jf-external-application/jftask/taskDetail",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": UA_APP,
      Cookie: buildUnicomCookie(session)
    },
    body: "{}"
  });
  const j = safeJson(res.body);
  const list = j?.data?.taskDetail?.taskList || [];
  pushLog(session, `[安全管家] 任务列表获取${Array.isArray(list) ? "成功" : "失败"}`);
}

async function cloudDiskModule(session) {
  pushLog(session, "[联通云盘] 开始");
  const ticket = await getTicketByNative(session, "edop_unicom_d67b3e30");
  if (!ticket) return pushLog(session, "[联通云盘] 获取ticket失败");
  const token = await cloudDispatcherToken(ticket);
  if (!token) return pushLog(session, "[联通云盘] 获取userToken失败");
  pushLog(session, "[联通云盘] userToken已获取");
  const times = await http({
    url: "https://panservice.mail.wo.cn/activity/lottery/lottery-times?activityId=Mjc=",
    method: "GET",
    headers: {
      "User-Agent": UA_APP,
      Authorization: token
    }
  });
  const tj = safeJson(times.body);
  const n = Number(tj?.data?.times ?? tj?.data?.lotteryTimes ?? 0);
  pushLog(session, `[联通云盘] 测速抽奖次数: ${isNaN(n) ? 0 : n}`);
}

async function woreadModule(session) {
  pushLog(session, "[联通阅读] 开始");
  const auth = await woreadAuth(session);
  if (!auth?.ok) return pushLog(session, `[联通阅读] 认证失败: ${auth?.msg || "unknown"}`);
  const login = await woreadLogin(session, auth.accesstoken);
  if (!login?.ok) return pushLog(session, `[联通阅读] 登录失败: ${login?.msg || "unknown"}`);
  const q = await woreadQueryTicketAccount(session, auth.accesstoken, login.token, login.phone || session.mobile || "");
  if (q?.ok) pushLog(session, `[联通阅读] 红包余额: ${q.balance}元`);
  await woreadDraw(session, auth.accesstoken, login.token, login.phone || session.mobile || "");
}

async function aitingModule(session) {
  pushLog(session, "[联通爱听] 开始");
  // 爱听依赖 AES 参数签名链路，先做服务连通性与入口验证
  const res = await http({
    url: "https://pcc.woread.com.cn",
    method: "GET",
    headers: { "User-Agent": UA_APP }
  });
  pushLog(session, `[联通爱听] 服务连通性: ${res.ok ? "正常" : "失败"}`);
}

async function wostoreModule(session) {
  pushLog(session, "[沃云手机] 开始");
  const target = "https://h5forphone.wostore.cn/cloudPhone/dialogCloudPhone.html?channel_id=ST-Zujian001-gs&cp_id=91002997";
  const entry = await openPlatLineNew(session, target);
  if (!entry?.ticket) return pushLog(session, "[沃云手机] 获取入口Ticket失败");
  const tokens = await wostoreLogin(entry.ticket);
  if (!tokens?.user_token) return pushLog(session, "[沃云手机] 登录失败");
  const userToken = tokens.user_token;

  await http({
    url: "https://uphone.wostore.cn/h5api/activity-service/points/v1/sign",
    method: "POST",
    headers: { "Content-Type": "application/json", "X-USR-TOKEN": userToken, Origin: "https://uphone.wostore.cn" },
    body: JSON.stringify({ activityCode: "Points_Sign_2507" })
  });
  await http({
    url: "https://uphone.wostore.cn/h5api/activity-service/user/task/list",
    method: "POST",
    headers: { "Content-Type": "application/json", "X-USR-TOKEN": userToken },
    body: JSON.stringify({ activityCode: "HD2026033000125" })
  });
  await http({
    url: "https://uphone.wostore.cn/h5api/activity-service/user/task/raffle/get",
    method: "POST",
    headers: { "Content-Type": "application/json", "X-USR-TOKEN": userToken },
    body: JSON.stringify({ activityCode: "HD2026033000125", taskCode: "2508-01" })
  });
  const draw = await http({
    url: "https://uphone.wostore.cn/h5api/activity-service/lottery",
    method: "POST",
    headers: { "Content-Type": "application/json", "X-USR-TOKEN": userToken },
    body: JSON.stringify({ activityCode: "HD2026033000125" })
  });
  const dj = safeJson(draw.body);
  pushLog(session, `[沃云手机] 抽奖: ${dj?.data?.prizeName || dj?.msg || "完成"}`);
}

async function regionalModule(session) {
  pushLog(session, "[区域专区] 开始");
  if (!session.cityInfo || !session.cityInfo.length) {
    session.cityInfo = await fetchCityInfo(session);
  }
  const provinces = (session.cityInfo || []).map((x) => String(x.proName || ""));
  const isLiaoning = provinces.some((x) => x.includes("辽宁"));
  const isYunnan = provinces.some((x) => x.includes("云南"));
  const isXinjiang = provinces.some((x) => x.includes("新疆"));
  const isHenan = provinces.some((x) => x.includes("河南"));
  const isAnhui = provinces.some((x) => x.includes("安徽"));
  const isNeimenggu = provinces.some((x) => x.includes("内蒙古"));
  const recognized = [isLiaoning && "辽宁", isYunnan && "云南", isXinjiang && "新疆", isHenan && "河南", isAnhui && "安徽", isNeimenggu && "内蒙古"].filter(Boolean).join("/");
  if (!recognized) {
    const sample = (session.cityInfo || []).slice(0, 2).map((x) => JSON.stringify(x)).join(" | ");
    pushLog(session, `[区域专区] 识别: 未识别 (cityInfo=${(session.cityInfo || []).length}条 ${sample || "空"})`);
  } else {
    pushLog(session, `[区域专区] 识别: ${recognized}`);
  }

  if (isLiaoning) await regionalLiaoning(session);
  if (isYunnan) pushLog(session, "[区域专区-云南] 已识别，待补全签名任务链路");
  if (isXinjiang) pushLog(session, "[区域专区-新疆] 已识别，待补全专区抽奖链路");
  if (isHenan) pushLog(session, "[区域专区-河南] 已识别，待补全商都签到链路");
  if (isAnhui) pushLog(session, "[区域专区-安徽] 已识别，待补全周五抢购链路");
  if (isNeimenggu) pushLog(session, "[区域专区-内蒙古] 已识别，当前暂无已接入专属活动");
}

async function regionalLiaoning(session) {
  const target = "https://weixin.linktech.hk/lv-web/handHall/autoLogin?actcode=sign";
  const ticketRes = await openPlatLineNew(session, target);
  if (!ticketRes?.ticket) return pushLog(session, "[区域专区-辽宁] 获取ticket失败");
  const mobile = session.mobile || "";
  const ts = compactTs14();
  const postage = md5(`${mobile}${ts}`);
  const loginUrl = "https://weixin.linktech.hk/lv-web/handHall/autoLogin"
    + `?actcode=sign&type=${encodeURIComponent(ticketRes.type || "06")}`
    + `&ticket=${encodeURIComponent(ticketRes.ticket)}&version=android@11.0802`
    + `&timestamp=${ts}&desmobile=${encodeURIComponent(mobile)}&num=0&postage=${postage}&userNumber=${encodeURIComponent(mobile)}`;
  const sidRet = await followRedirectForParam(loginUrl, "sid", { headers: { "User-Agent": UA_APP }, maxHops: 6 });
  const sid = sidRet.value || "";
  if (!sid) return pushLog(session, "[区域专区-辽宁] sid获取失败");
  pushLog(session, `[区域专区-辽宁] sid已获取 ${sid.slice(0, 8)}...`);
}

async function getTicketByNative(session, appId) {
  const res = await http({
    url: `https://m.client.10010.com/edop_ng/getTicketByNative?token=${encodeURIComponent(session.ecs_token || "")}&appId=${encodeURIComponent(appId)}`,
    method: "GET",
    headers: {
      "User-Agent": UA_IOS,
      "Accept": "*/*",
      Cookie: buildUnicomCookie(session)
    }
  });
  const j = safeJson(res.body);
  return j.ticket || "";
}

async function cloudDispatcherToken(ticket) {
  const timestamp = String(Date.now());
  const reqSeq = randomDigits(6);
  const sign = md5(`HandheldHallAutoLoginV2${timestamp}${reqSeq}wohome`);
  const body = {
    header: { key: "HandheldHallAutoLoginV2", resTime: timestamp, reqSeq, channel: "wohome", version: "", sign },
    body: { clientId: "1001000003", ticket }
  };
  const res = await http({
    url: "https://panservice.mail.wo.cn/wohome/dispatcher",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "Dalvik/2.1.0 (Linux; U; Android 12; leijun Pro Build/SKQ1.22013.001);unicom{version:android@11.0702}"
    },
    body: JSON.stringify(body)
  });
  const j = safeJson(res.body);
  return j?.RSP?.DATA?.token || "";
}

async function wostoreLogin(ticket) {
  const step1 = await http({
    url: "https://member.zlhz.wostore.cn/wcy_member/yunPhone/h5Awake/businessHall",
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://h5forphone.wostore.cn" },
    body: JSON.stringify({
      cpId: "91002997",
      channelId: "ST-Zujian001-gs",
      ticket,
      env: "prod",
      transId: "S2ndpage1235+开福袋！+F1+CJDD00D0001+iphone_c@12.0801",
      qkActId: null
    })
  });
  const j1 = safeJson(step1.body);
  if (String(j1.code) !== "0") return null;
  const redirectUrl = j1?.data?.url || "";
  const firstToken = getQueryParam(redirectUrl, "token");
  if (!firstToken) return null;
  const step2 = await http({
    url: "https://uphone.wostore.cn/h5api/activity-service/user/login",
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://uphone.wostore.cn", "X-USR-TOKEN": firstToken },
    body: JSON.stringify({
      identityType: "cloudPhoneLogin",
      code: firstToken,
      channelId: "ST-Zujian001-gs",
      activityId: "HD2026033000125",
      device: "device"
    })
  });
  const j2 = safeJson(step2.body);
  if (String(j2.code) !== "200") return null;
  return { firstToken, user_token: j2?.data?.user_token || "" };
}

async function woreadAuth(session) {
  try {
    const productId = "10000002";
    const secret = "7k1HcDL8RKvc";
    const ts = String(Date.now());
    const md = md5(`${productId}${secret}${ts}`);
    const date = compactTs14();
    const sign = await woreadEncrypt({ timestamp: date });
    if (!sign) return { ok: false, msg: "加密不可用" };
    const res = await http({
      url: `https://10010.woread.com.cn/ng_woread_service/rest/app/auth/${productId}/${ts}/${md}`,
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": UA_APP },
      body: JSON.stringify({ sign })
    });
    const j = safeJson(res.body);
    if (j.code === "0000" && j?.data?.accesstoken) return { ok: true, accesstoken: j.data.accesstoken };
    return { ok: false, msg: j.message || j.msg || j.code || "unknown" };
  } catch (e) {
    return { ok: false, msg: String(e) };
  }
}

async function woreadLogin(session, accesstoken) {
  try {
    const tokenEnc = await woreadEncrypt(session.token || "");
    const phoneRaw = /^1\d{10}$/.test(String(session.mobile || "")) ? String(session.mobile) : "13800000000";
    pushLog(session, `[联通阅读] 登录手机号源: ${/^1\d{10}$/.test(String(session.mobile || "")) ? "实名号码" : "回退号码"}`);
    const phoneEnc = await woreadEncrypt(phoneRaw);
    const timestamp = compactTs14();
    const inner = JSON.stringify({ tokenOnline: tokenEnc, phone: phoneEnc, timestamp });
    const sign = await woreadEncrypt(inner);
    if (!sign) return { ok: false, msg: "加密不可用" };
    const res = await http({
      url: "https://10010.woread.com.cn/ng_woread_service/rest/account/login",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": UA_APP,
        accesstoken,
        Cookie: buildUnicomCookie(session)
      },
      body: JSON.stringify({ sign })
    });
    const j = safeJson(res.body);
    if (j.code === "0000") {
      const d = j.data || {};
      return {
        ok: true,
        token: d.token || "",
        userid: d.userid || "",
        userindex: d.userindex || "",
        verifycode: d.verifycode || "",
        phone: d.phone || phoneRaw
      };
    }
    // 兼容回退：使用 Python aiting_woread_login 同款固定 access_token 再尝试一次
    const fallback = await woreadLoginFallback(session, phoneRaw);
    if (fallback?.ok) return fallback;
    return { ok: false, msg: j.message || j.msg || j.code || "unknown" };
  } catch (e) {
    return { ok: false, msg: String(e) };
  }
}

async function woreadLoginFallback(session, phoneRaw) {
  const fixedAccessToken = "ODZERTZCMjA1NTg1MTFFNDNFMThDRDYw";
  const phoneEnc = await woreadEncrypt(phoneRaw);
  const timestamp = compactTs14();
  const tokenEnc = session.token ? await woreadEncrypt(session.token) : "";

  const attempts = [
    tokenEnc ? { tokenOnline: tokenEnc, phone: phoneEnc, timestamp } : null,
    { phone: phoneEnc, timestamp }
  ].filter(Boolean);

  for (let i = 0; i < attempts.length; i++) {
    const sign = await woreadEncrypt(attempts[i]);
    if (!sign) continue;
    const res = await http({
      url: "https://10010.woread.com.cn/ng_woread_service/rest/account/login",
      method: "POST",
      headers: {
        "User-Agent": "Mozilla/5.0 (Linux; Android 11; Redmi Note 10 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/92.0.4515.159 Mobile Safari/537.36",
        "accesstoken": fixedAccessToken,
        "Content-Type": "application/json;charset=UTF-8",
        "Origin": "https://10010.woread.com.cn",
        Cookie: buildUnicomCookie(session)
      },
      body: JSON.stringify({ sign })
    });
    const j = safeJson(res.body);
    if (j.code === "0000") {
      const d = j.data || {};
      return {
        ok: true,
        token: d.token || "",
        userid: d.userid || "",
        userindex: d.userindex || "",
        verifycode: d.verifycode || "",
        phone: d.phone || phoneRaw
      };
    }
  }
  return { ok: false };
}

async function woreadQueryTicketAccount(session, accesstoken, token, phone) {
  const sign = await woreadEncrypt({ timestamp: compactTs14(), phone, token });
  if (!sign) return { ok: false, msg: "加密不可用" };
  const res = await http({
    url: "https://10010.woread.com.cn/ng_woread_service/rest/phone/vouchers/queryTicketAccount",
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": UA_APP, accesstoken, Cookie: buildUnicomCookie(session) },
    body: JSON.stringify({ sign })
  });
  const j = safeJson(res.body);
  if (j.code !== "0000") return { ok: false, msg: j.message || j.msg || j.code || "unknown" };
  const usable = Number(j?.data?.usableNum || 0);
  return { ok: true, balance: (usable / 100).toFixed(2) };
}

async function woreadDraw(session, accesstoken, token, phone) {
  const sign = await woreadEncrypt({ activeindex: "8051", timestamp: compactTs14(), phone, token });
  if (!sign) return pushLog(session, "[联通阅读] 抽奖跳过: 加密不可用");
  const res = await http({
    url: "https://10010.woread.com.cn/ng_woread_service/rest/basics/doDraw",
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": UA_APP, accesstoken, Cookie: buildUnicomCookie(session) },
    body: JSON.stringify({ sign })
  });
  const j = safeJson(res.body);
  if (j.code === "0000") {
    const prize = j?.data?.prizedesc || "未中奖";
    pushLog(session, `[联通阅读] 抽奖: ${prize}`);
  } else {
    pushLog(session, `[联通阅读] 抽奖失败: ${j.message || j.msg || j.code || "unknown"}`);
  }
}

async function openPlatLineNew(session, toUrl, silent = false) {
  const url = `https://m.client.10010.com/mobileService/openPlatform/openPlatLineNew.htm?to_url=${encodeURIComponent(toUrl)}`;
  const cookie = buildUnicomCookie(session);
  const res = await http({
    url,
    method: "GET",
    headers: {
      "User-Agent": UA_APP,
      "Accept": "*/*",
      "Connection": "keep-alive",
      "Cookie": cookie
    },
    opts: { redirection: false }
  });
  if (!res.ok) return null;
  const loc = res.headers?.location || res.headers?.Location || "";
  let t = getQueryParam(loc, "ticket");
  let type = getQueryParam(loc, "type");
  if (!t) {
    const body = res.body || "";
    t = getQueryParam(body, "ticket");
    type = type || getQueryParam(body, "type");
  }
  if (!t) {
    if (!silent && res.status === 200) {
      const preview = String(res.body || "").slice(0, 120).replace(/\s+/g, " ");
      pushLog(session, `[取票] 命中200落地页，预览: ${preview}`);
    }
    if (!silent) pushLog(session, `[取票] 失败 status=${res.status} location=${loc ? "有" : "无"}`);
    return null;
  }
  return t ? { ticket: t, type: type || "", loc } : null;
}

async function wocareGetSid(session, ticket) {
  const url = `https://wocare.unisk.cn/mbh/getToken?channelType=${WOCARE.serviceLife}&type=02&ticket=${encodeURIComponent(ticket)}&version=android@11.0802&timestamp=${wocareTs()}&desmobile=${session.mobile || ""}&num=0&postage=${randomString(32)}&homePage=home&duanlianjieabc=qAz2m&userNumber=${session.mobile || ""}`;
  const ret = await followRedirectForParam(url, "sid", {
    headers: { "User-Agent": UA_APP, "Cookie": buildUnicomCookie(session) },
    fallbackParam: "uuid",
    maxHops: 6
  });
  if (!ret.value) pushLog(session, `[联通祝福] getSid失败 status=${ret.lastStatus}`);
  return ret.value || "";
}

async function wocareLogin(session, sid) {
  const data = await wocareApi(session, "loginmbh", {
    sid,
    channelType: WOCARE.serviceLife,
    apiCode: "loginmbh"
  });
  if (data?.resultCode === "0000") return data?.data?.token || "";
  return "";
}

async function wocareDoTasks(session, token, activity) {
  const taskData = await wocareApi(session, "getDrawTask", {
    token,
    channelType: WOCARE.serviceLife,
    type: activity.id,
    apiCode: "getDrawTask"
  });
  const list = taskData?.data?.taskList || [];
  for (const task of list) {
    if (String(task.taskStatus || "0") !== "0") continue;
    await wocareApi(session, "completeTask", {
      token,
      channelType: WOCARE.serviceLife,
      task: task.id,
      taskStep: "1",
      type: activity.id,
      apiCode: "completeTask"
    });
    await wait(800);
    await wocareApi(session, "completeTask", {
      token,
      channelType: WOCARE.serviceLife,
      task: task.id,
      taskStep: "4",
      type: activity.id,
      apiCode: "completeTask"
    });
  }
}

async function wocareDoDraw(session, token, activity) {
  const init = await wocareApi(session, "loadInit", {
    token,
    channelType: WOCARE.serviceLife,
    type: activity.id,
    apiCode: "loadInit"
  });
  if (init?.resultCode !== "0000") return;
  const groupId = init?.data?.zActiveModuleGroupId;
  let count = 0;
  if (activity.id === 2) count = init?.data?.data?.isPartake ? 0 : 1;
  if (activity.id === 3) count = Number(init?.data?.raffleCountValue || 0);
  if (activity.id === 4) count = Number(init?.data?.mhRaffleCountValue || 0);
  if (count <= 0) return pushLog(session, `[联通祝福] ${activity.name} 无抽奖次数`);
  pushLog(session, `[联通祝福] ${activity.name} 抽奖次数 ${count}`);
  while (count-- > 0) {
    const draw = await wocareApi(session, "luckDraw", {
      token,
      channelType: WOCARE.serviceLife,
      zActiveModuleGroupId: groupId,
      type: activity.id,
      apiCode: "luckDraw"
    });
    const prize = draw?.data?.data?.prize?.prizeName || "未中奖";
    pushLog(session, `[联通祝福] ${activity.name}: ${prize}`);
    await wait(1200);
  }
}

async function wocareGetSpecificityBanner(session, token) {
  const res = await wocareApi(session, "getSpecificityBanner", { token, apiCode: "getSpecificityBanner" });
  if (res?.resultCode !== "0000") return [];
  const list = Array.isArray(res?.data) ? res.data : [];
  return list
    .filter((x) => String(x.activityStatus || "1") === "0" && String(x.isDeleted || "1") === "0" && x.id)
    .map((x) => ({ id: Number(x.id), name: x.name || `活动${x.id}` }));
}

async function wocareApi(session, apiCode, requestData = {}) {
  const ts = wocareTs();
  const body = {
    version: WOCARE.version,
    apiCode,
    channelId: WOCARE.channelId,
    transactionId: ts + randomDigits(6),
    timeStamp: ts,
    messageContent: b64(JSON.stringify(requestData))
  };
  const signSource = Object.keys(body).sort().map((k) => `${k}=${body[k]}`).join("&") + `&sign=${WOCARE.signKey}`;
  body.sign = md5(signSource);
  const res = await http({
    url: `https://wocare.unisk.cn/api/v1/${apiCode}`,
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": UA_APP },
    body: toForm(body)
  });
  if (!res.ok) return null;
  const json = safeJson(res.body);
  if (json.messageContent) {
    const decoded = safeJson(fromB64(String(json.messageContent).replace(/-/g, "+").replace(/_/g, "/")));
    if (decoded && typeof decoded === "object") {
      if (decoded.data) json.data = decoded.data;
      if (decoded.resultCode) json.resultCode = decoded.resultCode;
      if (decoded.resultMsg) json.resultMsg = decoded.resultMsg;
    }
  }
  return json;
}

async function ttlxjAuthorize(session, ticketRes) {
  const payload = {
    response_type: "rptid",
    client_id: "73b138fd-250c-4126-94e2-48cbcc8b9cbe",
    redirect_uri: "https://epay.10010.com/ci-mps-st-web/",
    login_hint: {
      credential_type: "st_ticket",
      credential: ticketRes.ticket,
      st_type: ticketRes.type || "",
      force_logout: true,
      source: "app_sjyyt"
    },
    device_info: {
      token_id: `chinaunicom-pro-${Date.now()}-${randomString(13)}`,
      trace_id: randomString(32)
    }
  };
  const res = await http({
    url: "https://epay.10010.com/woauth2/v2/authorize",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://epay.10010.com",
      Referer: ticketRes.loc || "https://epay.10010.com/",
      Cookie: session.epayCookie || ""
    },
    body: JSON.stringify(payload)
  });
  session.epayCookie = mergeCookie(session.epayCookie, readSetCookie(res.headers));
  return !!res.ok;
}

async function ttlxjAuthCheck(session) {
  const biz = getBizChannelInfo(session);
  const req = await http({
    url: "https://epay.10010.com/ps-pafs-auth-front/v1/auth/check",
    method: "POST",
    headers: { "Content-Type": "application/json", bizchannelinfo: biz, Cookie: session.epayCookie || "" },
    body: "{}"
  });
  session.epayCookie = mergeCookie(session.epayCookie, readSetCookie(req.headers));
  if (!req.ok) return { ok: false, msg: req.msg || "网络失败" };
  const data = safeJson(req.body);
  if (data.code === "0000") {
    const ai = data?.data?.authInfo || {};
    return { ok: true, sessionId: ai.sessionId || "", tokenId: ai.tokenId || "", userId: ai.userId || "", rptId: session.rptId || "" };
  }
  if (data.code === "2101000100") {
    const loginUrl = data?.data?.woauth_login_url;
    if (!loginUrl) return { ok: false, msg: "缺少woauth_login_url" };
    const target = `${loginUrl}https://epay.10010.com/ci-mcss-party-web/clockIn/?bizFrom=225&bizChannelCode=225`;
    const ret = await followRedirectForParam(target, "rptid", {
      headers: {
        "User-Agent": UA_APP,
        "Accept": "*/*",
        "Referer": "https://epay.10010.com/",
        "Cookie": mergeCookie(buildUnicomCookie(session), session.epayCookie || "")
      },
      maxHops: 8,
      cookieSession: session,
      cookieField: "epayCookie"
    });
    const rptid = ret.value;
    if (!rptid) return { ok: false, msg: "无法获取rptid" };
    session.rptId = rptid;
    return ttlxjAuthCheck(session);
  }
  return { ok: false, msg: data.msg || `code=${data.code || "unknown"}` };
}

async function ttlxjDoClockIn(session) {
  const headers = ttlxjHeaders(session);
  const infoRes = await http({
    url: "https://epay.10010.com/ci-mcss-party-front/v1/ttlxj/userDrawInfo",
    method: "POST",
    headers,
    body: "{}"
  });
  if (!infoRes.ok) return pushLog(session, "[天天领现金] userDrawInfo请求失败");
  const data = safeJson(infoRes.body);
  if (data.code !== "0000") return pushLog(session, `[天天领现金] 查询失败: ${data.msg || data.code}`);
  const dow = data?.data?.dayOfWeek;
  const k = `day${dow}`;
  const need = data?.data?.[k] === "1";
  if (!need) return pushLog(session, "[天天领现金] 今日已打卡");
  const today = new Date().getDay();
  const drawType = today === 0 ? "C" : "B";
  const drawRes = await http({
    url: "https://epay.10010.com/ci-mcss-party-front/v1/ttlxj/unifyDrawNew",
    method: "POST",
    headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded" },
    body: toForm({ drawType, bizFrom: "225", activityId: "TTLXJ20210330" })
  });
  const json = safeJson(drawRes.body);
  if (json.code === "0000") pushLog(session, `[天天领现金] 打卡成功: ${json?.data?.prizeName || "完成"}`);
  else pushLog(session, `[天天领现金] 打卡失败: ${json.msg || json.code || "unknown"}`);
}

async function ttlxjQueryAvailable(session) {
  const res = await http({
    url: "https://epay.10010.com/ci-mcss-party-front/v1/ttlxj/queryAvailable",
    method: "POST",
    headers: ttlxjHeaders(session),
    body: "{}"
  });
  const json = safeJson(res.body);
  if (json.code !== "0000") return pushLog(session, `[天天领现金] 余额查询失败: ${json.msg || json.code}`);
  const d = json.data || {};
  const a = Number(d.availableAmount || 0) / 100;
  pushLog(session, `[天天领现金] 可用立减金: ${a.toFixed(2)}元`);
}

function ttlxjHeaders(session) {
  return {
    "Content-Type": "application/json",
    bizchannelinfo: getBizChannelInfo(session),
    authinfo: JSON.stringify({
      mobile: "",
      sessionId: session.ttlxj?.sessionId || "",
      tokenId: session.ttlxj?.tokenId || "",
      userId: session.ttlxj?.userId || ""
    })
  };
}

function getBizChannelInfo(session) {
  return JSON.stringify({
    bizChannelCode: "225",
    disriBiz: "party",
    unionSessionId: "",
    stType: "",
    stDesmobile: "",
    source: "",
    rptId: session.rptId || "",
    ticket: "",
    tongdunTokenId: `chinaunicom-${randomString(16).toUpperCase()}`,
    xindunTokenId: randomString(32)
  });
}

async function marketGetUserToken(session, ticket) {
  const res = await http({
    url: `https://backward.bol.wo.cn/prod-api/auth/marketUnicomLogin?ticket=${encodeURIComponent(ticket)}`,
    method: "POST",
    headers: { "User-Agent": UA_APP }
  });
  if (!res.ok) return "";
  const json = safeJson(res.body);
  if (json.code === 200) return json?.data?.token || "";
  return "";
}

async function marketDoTasks(session, userToken) {
  const headers = {
    Authorization: `Bearer ${userToken}`,
    "User-Agent": UA_APP,
    Origin: "https://contact.bol.wo.cn",
    Referer: "https://contact.bol.wo.cn/",
    Cookie: `ecs_token=${session.ecs_token}`
  };
  const res = await http({
    url: "https://backward.bol.wo.cn/prod-api/promotion/activityTask/getAllActivityTasks?activityId=12",
    method: "GET",
    headers
  });
  const json = safeJson(res.body);
  const list = json?.data?.activityTaskUserDetailVOList || [];
  pushLog(session, `[权益超市] 任务数 ${list.length}`);
  for (const t of list) {
    const name = t.name || "";
    const done = Number(t.triggeredTime || 0) >= Number(t.triggerTime || 0);
    if (done || /购买|秒杀/.test(name)) continue;
    const key = t.param1 || "";
    let url = "";
    if (/浏览|查看/.test(name)) url = `https://backward.bol.wo.cn/prod-api/promotion/activityTaskShare/checkView?checkKey=${encodeURIComponent(key)}`;
    if (/分享/.test(name)) url = `https://backward.bol.wo.cn/prod-api/promotion/activityTaskShare/checkShare?checkKey=${encodeURIComponent(key)}`;
    if (!url) continue;
    const r = await http({ url, method: "POST", headers, body: "{}" });
    const j = safeJson(r.body);
    pushLog(session, `[权益超市] ${name}: ${j.code === 200 ? "成功" : "失败"}`);
    await wait(700);
  }
}

async function marketWateringTask(session, userToken) {
  const statusUrl = "https://backward.bol.wo.cn/prod-api/promotion/activityTask/getMultiCycleProcess?activityId=13";
  const token = String(userToken || "").replace(/^Bearer\s+/i, "");
  const headers = {
    Authorization: `Bearer ${token}`,
    "User-Agent": UA_APP,
    Origin: "https://contact.bol.wo.cn",
    Referer: "https://contact.bol.wo.cn/",
    "X-Requested-With": "com.sinovatech.unicom.ui"
  };
  const stRes = await http({ url: statusUrl, method: "GET", headers });
  const stJson = safeJson(stRes.body);
  if (stJson.code !== 200) return pushLog(session, `[权益超市-浇水] 状态查询失败: ${stJson.msg || stJson.code || "unknown"}`);

  const d = stJson.data || {};
  const before = Number(d.triggeredTime || 0);
  const need = Number(d.triggerTime || 0);
  const last = String(d.createDate || "").split(" ")[0];
  const today = dateYmd();
  pushLog(session, `[权益超市-浇水] 进度 ${before}/${need}`);
  if (today === last) return pushLog(session, "[权益超市-浇水] 今日已浇水");
  if (before >= need) return pushLog(session, "[权益超市-浇水] 已满足领奖条件");

  const loginId = parseJwtLoginId(token);
  if (!loginId) return pushLog(session, "[权益超市-浇水] 无法解析 loginId，跳过");

  const xbsosjl = "Y1mN8fNYktY0";
  const ts = String(Date.now());
  const q = `xbsosjl=${xbsosjl}&timeVerRan=${ts}&diceid=${loginId}`;
  const waterUrl = `https://backward.bol.wo.cn/prod-api/promotion/activityTaskShare/checkWatering?${q}`;
  const sign = await marketWateringSignature(xbsosjl, loginId, ts);
  const wr = await http({
    url: waterUrl,
    method: "POST",
    headers: {
      ...headers,
      "Authorization": `Bearer ${token}`,
      "User-Agent": "Mozilla/5.0 (Linux; Android 10; MI 8 Build/QKQ1.190828.002; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/143.0.7499.146 Mobile Safari/537.36; unicom{version:android@11.0802,desmobile:0};devicetype{deviceBrand:Xiaomi,deviceModel:MI 8}",
      "Content-Type": "application/json",
      "Accept": "*/*",
      "X-Signature": sign
    },
    body: "{}"
  });
  const wj = safeJson(wr.body);
  if (wj.code !== 200) {
    return pushLog(session, `[权益超市-浇水] 尝试失败: ${wj.msg || wj.code || "签名校验失败"}`);
  }
  pushLog(session, "[权益超市-浇水] 浇水请求已提交");
}

async function marketPrizeList(session, userToken) {
  const token = String(userToken || "").replace(/^Bearer\s+/i, "");
  const ts = Date.now();
  const url = `https://backward.bol.wo.cn/prod-api/promotion/home/raffleActivity/prizeList?id=12&timeVerRan=${ts}`;
  const res = await http({
    url,
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": UA_APP,
      Origin: "https://contact.bol.wo.cn",
      Referer: "https://contact.bol.wo.cn/market",
      "Content-Type": "application/json"
    },
    body: "{}"
  });
  const j = safeJson(res.body);
  if (j.code !== 200 || !Array.isArray(j.data)) return;
  const hot = j.data.filter((p) => {
    const n = String(p.name || "");
    const hasKey = /月卡|月会员|月度|VIP月|一个月|周卡/.test(n);
    const excluded = /5G宽视界|沃视频/.test(n);
    const stock = Number(p.dailyPrizeLimit || 0) > 0;
    return hasKey && !excluded && stock;
  });
  if (hot.length) {
    pushLog(session, `[权益超市] 奖池监测到 ${hot.length} 个高价值奖品`);
  }
}

async function marketDoRaffle(session, userToken) {
  const headers = {
    Authorization: `Bearer ${userToken}`,
    "User-Agent": UA_APP,
    Origin: "https://contact.bol.wo.cn",
    Referer: "https://contact.bol.wo.cn/market",
    "Content-Type": "application/json"
  };
  const ts = Date.now();
  const cRes = await http({
    url: `https://backward.bol.wo.cn/prod-api/promotion/home/raffleActivity/getUserRaffleCountExt?id=12&channel=unicomTab&timeVerRan=${ts}`,
    method: "POST",
    headers,
    body: "{}"
  });
  const cJson = safeJson(cRes.body);
  let count = 0;
  if (cJson.code === 200) count = Number(cJson?.data?.raffleCount ?? cJson.data ?? 0);
  if (count <= 0) return pushLog(session, "[权益超市] 无抽奖次数");
  pushLog(session, `[权益超市] 抽奖次数 ${count}`);
  while (count-- > 0) {
    const dRes = await http({
      url: `https://backward.bol.wo.cn/prod-api/promotion/home/raffleActivity/userRaffle?id=12&channel=unicomTab&timeVerRan=${Date.now()}`,
      method: "POST",
      headers,
      body: "{}"
    });
    const dJson = safeJson(dRes.body);
    const prize = dJson?.data?.prizesName || dJson?.data?.message || dJson?.msg || "未知";
    pushLog(session, `[权益超市] 抽奖: ${prize}`);
    await wait(1100);
  }
}

function parseAccount(line) {
  const parts = line.split("#").map((x) => x.trim());
  const p1 = parts[0] || "";
  const p2 = parts[1] || "";

  if (!p1 || !p2) {
    throw new Error(`格式错误: 仅支持 token_online#appId，当前值: ${line.slice(0, 20)}...`);
  }

  return {
    mobile: parts[2] || "",
    token: p1,
    appId: p2
  };
}

async function verifyOnline(token, appId) {
  const body = {
    isFirstInstall: "1",
    netWay: "Wifi",
    version: "android@11.0000",
    token_online: token,
    provinceChanel: "general",
    deviceModel: "ALN-AL10",
    step: "dingshi",
    androidId: "291a7deb1d716b5a",
    reqtime: Date.now(),
    appId
  };

  const req = {
    url: "https://m.client.10010.com/mobileService/onLine.htm",
    method: "POST",
    headers: {
      "User-Agent": UA_IOS,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: toForm(body)
  };

  const res = await http(req);
  if (!res.ok) return { ok: false, msg: res.msg || "网络失败" };

  const json = safeJson(res.body);
  if (json.code === "0" || json.code === 0) return { ok: true, data: json };

  return { ok: false, msg: json.msg || json.desc || `code=${json.code || "unknown"}` };
}

function withEcsTokenHeaders(session, ua) {
  const h = {
    "User-Agent": ua || UA_APP,
    "Accept": "application/json, text/plain, */*"
  };
  if (session.ecs_token) h.Cookie = `ecs_token=${session.ecs_token}`;
  return h;
}

function pushLog(session, message) {
  session.logs.push(message);
  $.log(`账号[${session.index}] ${message}`);
}

function safeJson(str) {
  try { return JSON.parse(str || "{}"); } catch { return {}; }
}
function parseJwtLoginId(token) {
  try {
    const p = token.split(".")[1];
    if (!p) return "";
    const txt = fromB64(p.replace(/-/g, "+").replace(/_/g, "/"));
    const o = safeJson(txt);
    return o.loginId || "";
  } catch {
    return "";
  }
}
function dateYmd() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function compactTs14() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
async function woreadEncrypt(data) {
  try {
    const key = strToBytes("woreadst^&*12345");
    const iv = strToBytes("16-Bytes--String");
    const raw = typeof data === "object" ? JSON.stringify(data) : String(data);
    const plain = pkcs7Pad(strToBytes(raw), 16);
    const cipher = await aesCbcEncrypt(plain, key, iv);
    const hex = bytesToHex(cipher);
    return b64(hex);
  } catch {
    return "";
  }
}
function pkcs7Pad(bytes, blockSize) {
  let pad = blockSize - (bytes.length % blockSize);
  if (pad === 0) pad = blockSize;
  return bytes.concat(new Array(pad).fill(pad));
}
async function aesCbcEncrypt(plainBytes, keyBytes, ivBytes) {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const key = await crypto.subtle.importKey("raw", new Uint8Array(keyBytes), { name: "AES-CBC" }, false, ["encrypt"]);
    const out = await crypto.subtle.encrypt({ name: "AES-CBC", iv: new Uint8Array(ivBytes) }, key, new Uint8Array(plainBytes));
    return Array.from(new Uint8Array(out));
  }
  throw new Error("AES不可用");
}
function bytesToHex(bytes) {
  return bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function followRedirectForParam(startUrl, paramKey, options = {}) {
  let current = startUrl;
  const maxHops = options.maxHops || 6;
  let lastStatus = 0;
  for (let i = 0; i < maxHops; i++) {
    const r = await http({
      url: current,
      method: "GET",
      headers: options.headers || {},
      opts: { redirection: false }
    });
    if (options.cookieSession && options.cookieField) {
      const incoming = readSetCookie(r.headers);
      if (incoming) {
        options.cookieSession[options.cookieField] = mergeCookie(
          options.cookieSession[options.cookieField] || "",
          incoming
        );
        if (options.headers) {
          options.headers.Cookie = mergeCookie(options.headers.Cookie || "", options.cookieSession[options.cookieField]);
        }
      }
    }
    lastStatus = r.status || 0;
    const loc = r.headers?.location || r.headers?.Location || "";
    let v = getQueryParam(loc, paramKey);
    if (!v && options.fallbackParam) v = getQueryParam(loc, options.fallbackParam);
    if (!v && r.body) {
      v = getQueryParam(String(r.body), paramKey);
      if (!v && options.fallbackParam) v = getQueryParam(String(r.body), options.fallbackParam);
    }
    if (v) return { value: v, lastStatus };
    if (!loc) break;
    current = absolutizeUrl(current, loc);
  }
  return { value: "", lastStatus };
}
function absolutizeUrl(base, next) {
  if (/^https?:\/\//i.test(next)) return next;
  try {
    const u = new URL(base);
    if (next.startsWith("/")) return `${u.protocol}//${u.host}${next}`;
    const path = u.pathname.split("/").slice(0, -1).join("/") || "";
    return `${u.protocol}//${u.host}${path}/${next}`;
  } catch {
    return next;
  }
}
function readSetCookie(headers) {
  if (!headers) return "";
  const raw = headers["set-cookie"] || headers["Set-Cookie"] || "";
  if (Array.isArray(raw)) return raw.join("; ");
  return String(raw || "");
}
function mergeCookie(base, add) {
  const jar = {};
  const push = (s) => {
    String(s || "")
      .split(/;\s*/)
      .forEach((kv) => {
        const i = kv.indexOf("=");
        if (i <= 0) return;
        const k = kv.slice(0, i).trim();
        const v = kv.slice(i + 1).trim();
        if (!k || /^(Path|Expires|Max-Age|Domain|HttpOnly|Secure|SameSite)$/i.test(k)) return;
        jar[k] = v;
      });
  };
  push(base);
  push(add);
  return Object.keys(jar).map((k) => `${k}=${jar[k]}`).join("; ");
}
async function marketWateringSignature(xbsosjl, loginId, ts) {
  const message = `td:433:tp${xbsosjl}td:334:et${loginId}td:334:et${ts}td:334:et`;
  return hmacSha256Base64(String(loginId), message);
}
async function hmacSha256Base64(key, message) {
  if (typeof crypto !== "undefined" && crypto.subtle && typeof TextEncoder !== "undefined") {
    try {
      const enc = new TextEncoder();
      const cryptoKey = await crypto.subtle.importKey(
        "raw",
        enc.encode(key),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
      );
      const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message));
      return bytesToBase64(new Uint8Array(sig));
    } catch (_) {}
  }
  // fallback: pure JS SHA256-HMAC
  return bytesToBase64(hmacSha256Bytes(strToBytes(key), strToBytes(message)));
}
function strToBytes(s) {
  const out = [];
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    else out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
  }
  return out;
}
function bytesToBase64(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  if (typeof btoa !== "undefined") return btoa(bin);
  return Buffer.from(bin, "binary").toString("base64");
}
function hmacSha256Bytes(keyBytes, msgBytes) {
  const block = 64;
  let key = keyBytes.slice();
  if (key.length > block) key = sha256Bytes(key);
  if (key.length < block) key = key.concat(new Array(block - key.length).fill(0));
  const o = new Array(block);
  const i = new Array(block);
  for (let k = 0; k < block; k++) {
    o[k] = key[k] ^ 0x5c;
    i[k] = key[k] ^ 0x36;
  }
  return sha256Bytes(o.concat(sha256Bytes(i.concat(msgBytes))));
}
function sha256Bytes(bytes) {
  const K = [1116352408,1899447441,-1245643825,-373957723,961987163,1508970993,-1841331548,-1424204075,-670586216,310598401,607225278,1426881987,1925078388,-2132889090,-1680079193,-1046744716,-459576895,-272742522,264347078,604807628,770255983,1249150122,1555081692,1996064986,-1740746414,-1473132947,-1341970488,-1084653625,-958395405,-710438585,113926993,-534999948,-160613618,-1090935817,-965641998,-903397682,-779700025,-354779690,-176337025,116418474,174292421,289380356,460393269,685471733,852142971,1017036298,1126000580,1288033470,1501505948,1607167915,1816402316,1856431235,1942199574,2024104815,-2067236844,-1933114872,-1866530822,-1538233109,-1090935817,-965641998,-903397682,-779700025,-354779690];
  // corrected constants:
  K.length = 0;
  K.push(
    1116352408,1899447441,-1245643825,-373957723,961987163,1508970993,-1841331548,-1424204075,
    -670586216,310598401,607225278,1426881987,1925078388,-2132889090,-1680079193,-1046744716,
    -459576895,-272742522,264347078,604807628,770255983,1249150122,1555081692,1996064986,
    -1740746414,-1473132947,-1341970488,-1084653625,-958395405,-710438585,113926993,338241895,
    666307205,773529912,1294757372,1396182291,1695183700,1986661051,-2117940946,-1838011259,
    -1564481375,-1474664885,-1035236496,-949202525,-778901479,-694614492,-200395387,275423344,
    430227734,506948616,659060556,883997877,958139571,1322822218,1537002063,1747873779,
    1955562222,2024104815,-2067236844,-1933114872,-1866530822,-1538233109,-1090935817,-965641998
  );
  const H = [1779033703,-1150833019,1013904242,-1521486534,1359893119,-1694144372,528734635,1541459225];
  const l = bytes.length;
  const bitLenHi = (l / 0x20000000) | 0;
  const bitLenLo = (l << 3) >>> 0;
  const m = bytes.slice();
  m.push(0x80);
  while ((m.length % 64) !== 56) m.push(0);
  m.push((bitLenHi >>> 24) & 0xff, (bitLenHi >>> 16) & 0xff, (bitLenHi >>> 8) & 0xff, bitLenHi & 0xff);
  m.push((bitLenLo >>> 24) & 0xff, (bitLenLo >>> 16) & 0xff, (bitLenLo >>> 8) & 0xff, bitLenLo & 0xff);
  const w = new Array(64);
  for (let off = 0; off < m.length; off += 64) {
    for (let t = 0; t < 16; t++) {
      const i = off + t * 4;
      w[t] = ((m[i] << 24) | (m[i + 1] << 16) | (m[i + 2] << 8) | m[i + 3]) | 0;
    }
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
      const s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
      w[t] = (((w[t - 16] + s0) | 0) + ((w[t - 7] + s1) | 0)) | 0;
    }
    let [a,b,c,d,e,f,g,h] = H;
    for (let t = 0; t < 64; t++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (((((h + S1) | 0) + ch) | 0) + K[t] + w[t]) | 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) | 0;
      h = g; g = f; f = e; e = (d + temp1) | 0;
      d = c; c = b; b = a; a = (temp1 + temp2) | 0;
    }
    H[0]=(H[0]+a)|0; H[1]=(H[1]+b)|0; H[2]=(H[2]+c)|0; H[3]=(H[3]+d)|0;
    H[4]=(H[4]+e)|0; H[5]=(H[5]+f)|0; H[6]=(H[6]+g)|0; H[7]=(H[7]+h)|0;
  }
  const out = [];
  for (const v of H) out.push((v>>>24)&0xff,(v>>>16)&0xff,(v>>>8)&0xff,v&0xff);
  return out;
}
function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }

function randomString(n) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < n; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}
function randomDigits(n) {
  let out = "";
  for (let i = 0; i < n; i++) out += Math.floor(Math.random() * 10);
  return out;
}
function wocareTs() {
  const d = new Date();
  const p = (n, l = 2) => String(n).padStart(l, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}${p(Math.floor(d.getMilliseconds()), 3)}`;
}
function b64(s) {
  if (typeof btoa !== "undefined") return btoa(unescape(encodeURIComponent(s)));
  return Buffer.from(s, "utf8").toString("base64");
}
function fromB64(s) {
  try {
    if (typeof atob !== "undefined") return decodeURIComponent(escape(atob(s)));
    return Buffer.from(s, "base64").toString("utf8");
  } catch {
    return "{}";
  }
}
function getQueryParam(url, key) {
  const pick = (s) => {
    const m = String(s || "").match(new RegExp(`[?&]${key}=([^&#]*)`));
    return m ? m[1] : "";
  };
  let src = String(url || "");
  for (let i = 0; i < 3; i++) {
    const v = pick(src);
    if (v) return decodeURIComponent(v);
    try {
      const dec = decodeURIComponent(src);
      if (dec === src) break;
      src = dec;
    } catch {
      break;
    }
  }
  // fallback: key%3Dvalue 形式
  const m2 = src.match(new RegExp(`${key}%3[Dd]([^&]+)`));
  return m2 ? decodeURIComponent(m2[1]) : "";
}
async function fetchCityInfo(session) {
  const res = await http({
    url: "https://m.client.10010.com/mobileService/business/get/getCity",
    method: "POST",
    headers: {
      "User-Agent": UA_APP,
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: buildUnicomCookie(session)
    },
    body: ""
  });
  const j = safeJson(res.body);
  const code = String(j.code ?? "");
  if ((code === "200" || code === "0000" || code === "0") && Array.isArray(j.list)) return j.list;
  if (Array.isArray(j?.data?.list)) return j.data.list;
  if (Array.isArray(j?.data)) return j.data;
  return [];
}
function md5(str) {
  function cmn(q, a, b, x, s, t) {
    a = add32(add32(a, q), add32(x, t));
    return add32((a << s) | (a >>> (32 - s)), b);
  }
  function ff(a, b, c, d, x, s, t) { return cmn((b & c) | (~b & d), a, b, x, s, t); }
  function gg(a, b, c, d, x, s, t) { return cmn((b & d) | (c & ~d), a, b, x, s, t); }
  function hh(a, b, c, d, x, s, t) { return cmn(b ^ c ^ d, a, b, x, s, t); }
  function ii(a, b, c, d, x, s, t) { return cmn(c ^ (b | ~d), a, b, x, s, t); }
  function md5cycle(x, k) {
    let [a, b, c, d] = x;
    a = ff(a, b, c, d, k[0], 7, -680876936); d = ff(d, a, b, c, k[1], 12, -389564586); c = ff(c, d, a, b, k[2], 17, 606105819); b = ff(b, c, d, a, k[3], 22, -1044525330);
    a = ff(a, b, c, d, k[4], 7, -176418897); d = ff(d, a, b, c, k[5], 12, 1200080426); c = ff(c, d, a, b, k[6], 17, -1473231341); b = ff(b, c, d, a, k[7], 22, -45705983);
    a = ff(a, b, c, d, k[8], 7, 1770035416); d = ff(d, a, b, c, k[9], 12, -1958414417); c = ff(c, d, a, b, k[10], 17, -42063); b = ff(b, c, d, a, k[11], 22, -1990404162);
    a = ff(a, b, c, d, k[12], 7, 1804603682); d = ff(d, a, b, c, k[13], 12, -40341101); c = ff(c, d, a, b, k[14], 17, -1502002290); b = ff(b, c, d, a, k[15], 22, 1236535329);
    a = gg(a, b, c, d, k[1], 5, -165796510); d = gg(d, a, b, c, k[6], 9, -1069501632); c = gg(c, d, a, b, k[11], 14, 643717713); b = gg(b, c, d, a, k[0], 20, -373897302);
    a = gg(a, b, c, d, k[5], 5, -701558691); d = gg(d, a, b, c, k[10], 9, 38016083); c = gg(c, d, a, b, k[15], 14, -660478335); b = gg(b, c, d, a, k[4], 20, -405537848);
    a = gg(a, b, c, d, k[9], 5, 568446438); d = gg(d, a, b, c, k[14], 9, -1019803690); c = gg(c, d, a, b, k[3], 14, -187363961); b = gg(b, c, d, a, k[8], 20, 1163531501);
    a = gg(a, b, c, d, k[13], 5, -1444681467); d = gg(d, a, b, c, k[2], 9, -51403784); c = gg(c, d, a, b, k[7], 14, 1735328473); b = gg(b, c, d, a, k[12], 20, -1926607734);
    a = hh(a, b, c, d, k[5], 4, -378558); d = hh(d, a, b, c, k[8], 11, -2022574463); c = hh(c, d, a, b, k[11], 16, 1839030562); b = hh(b, c, d, a, k[14], 23, -35309556);
    a = hh(a, b, c, d, k[1], 4, -1530992060); d = hh(d, a, b, c, k[4], 11, 1272893353); c = hh(c, d, a, b, k[7], 16, -155497632); b = hh(b, c, d, a, k[10], 23, -1094730640);
    a = hh(a, b, c, d, k[13], 4, 681279174); d = hh(d, a, b, c, k[0], 11, -358537222); c = hh(c, d, a, b, k[3], 16, -722521979); b = hh(b, c, d, a, k[6], 23, 76029189);
    a = hh(a, b, c, d, k[9], 4, -640364487); d = hh(d, a, b, c, k[12], 11, -421815835); c = hh(c, d, a, b, k[15], 16, 530742520); b = hh(b, c, d, a, k[2], 23, -995338651);
    a = ii(a, b, c, d, k[0], 6, -198630844); d = ii(d, a, b, c, k[7], 10, 1126891415); c = ii(c, d, a, b, k[14], 15, -1416354905); b = ii(b, c, d, a, k[5], 21, -57434055);
    a = ii(a, b, c, d, k[12], 6, 1700485571); d = ii(d, a, b, c, k[3], 10, -1894986606); c = ii(c, d, a, b, k[10], 15, -1051523); b = ii(b, c, d, a, k[1], 21, -2054922799);
    a = ii(a, b, c, d, k[8], 6, 1873313359); d = ii(d, a, b, c, k[15], 10, -30611744); c = ii(c, d, a, b, k[6], 15, -1560198380); b = ii(b, c, d, a, k[13], 21, 1309151649);
    a = ii(a, b, c, d, k[4], 6, -145523070); d = ii(d, a, b, c, k[11], 10, -1120210379); c = ii(c, d, a, b, k[2], 15, 718787259); b = ii(b, c, d, a, k[9], 21, -343485551);
    x[0] = add32(a, x[0]); x[1] = add32(b, x[1]); x[2] = add32(c, x[2]); x[3] = add32(d, x[3]);
  }
  function md5blk(s) {
    const md5blks = [];
    for (let i = 0; i < 64; i += 4) md5blks[i >> 2] = s.charCodeAt(i) + (s.charCodeAt(i + 1) << 8) + (s.charCodeAt(i + 2) << 16) + (s.charCodeAt(i + 3) << 24);
    return md5blks;
  }
  function md51(s) {
    let n = s.length;
    const state = [1732584193, -271733879, -1732584194, 271733878];
    let i;
    for (i = 64; i <= n; i += 64) md5cycle(state, md5blk(s.substring(i - 64, i)));
    s = s.substring(i - 64);
    const tail = new Array(16).fill(0);
    for (i = 0; i < s.length; i++) tail[i >> 2] |= s.charCodeAt(i) << ((i % 4) << 3);
    tail[i >> 2] |= 0x80 << ((i % 4) << 3);
    if (i > 55) { md5cycle(state, tail); for (i = 0; i < 16; i++) tail[i] = 0; }
    tail[14] = n * 8;
    md5cycle(state, tail);
    return state;
  }
  function rhex(n) {
    const s = "0123456789abcdef";
    let j; let out = "";
    for (j = 0; j < 4; j++) out += s[(n >> (j * 8 + 4)) & 0x0f] + s[(n >> (j * 8)) & 0x0f];
    return out;
  }
  function hex(x) { return x.map(rhex).join(""); }
  function add32(a, b) { return (a + b) & 0xffffffff; }
  return hex(md51(unescape(encodeURIComponent(str))));
}
function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }
function buildUnicomCookie(session) {
  const arr = [];
  if (session.ecs_token) arr.push(`ecs_token=${session.ecs_token}`);
  if (session.token) arr.push(`token_online=${session.token}`);
  if (session.appId) arr.push(`appId=${session.appId}`);
  if (session.tokenIdCookie) arr.push(`TOKENID_COOKIE=${session.tokenIdCookie}`);
  if (session.unicomTokenId) {
    arr.push(`UNICOM_TOKENID=${session.unicomTokenId}`);
    arr.push(`sdkuuid=${session.unicomTokenId}`);
  }
  return arr.join("; ");
}

function mask(s) {
  if (!s) return "";
  if (/^1\d{10}$/.test(s)) return `${s.slice(0, 3)}****${s.slice(7)}`;
  return s.length > 12 ? `${s.slice(0, 6)}******${s.slice(-6)}` : s;
}

function toForm(obj) {
  return Object.keys(obj)
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(obj[k] == null ? "" : obj[k])}`)
    .join("&");
}
function randomHex(n) {
  const chars = "abcdef0123456789";
  let out = "";
  for (let i = 0; i < n; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function http(opt) {
  return new Promise((resolve) => {
    $task.fetch({
      url: opt.url,
      method: opt.method || "GET",
      headers: opt.headers || {},
      body: opt.body || "",
      opts: opt.opts || {}
    }).then(
      (resp) => resolve({ ok: true, body: resp.body || "", status: resp.statusCode, headers: resp.headers || {} }),
      (err) => resolve({ ok: false, msg: String(err) })
    );
  });
}

function Env(name, opts) {
  return new (class {
    constructor(name, opts) {
      this.name = name;
      Object.assign(this, opts);
      this.log(`\n🔔${this.name}, 开始!`);
    }
    isQuanX() { return typeof $task !== "undefined"; }
    getdata(key) { return this.isQuanX() ? $prefs.valueForKey(key) : null; }
    setdata(val, key) { return this.isQuanX() ? $prefs.setValueForKey(val, key) : null; }
    log(...args) { console.log(args.join("\n")); }
    logErr(err) { console.log(`\n${this.name} 错误: ${err}`); }
    msg(title, sub = "", body = "") {
      if (this.isQuanX()) $notify(title, sub, body);
      else console.log(`${title}\n${sub}\n${body}`);
    }
    done(v = {}) { $done(v); }
  })(name, opts);
}
