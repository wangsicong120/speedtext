let maxtheard = 1;
let testurl = "";
let start_time = 0;

let all_down_sum = 0;
let run = false;

let visibl = true;

let thread_down = [];
let lsat_all_down = 0;
let lsat_date = 0;

let Maximum = 0;

let now_speed = 0;
let now_local_ping = 0;
let now_global_ping = 0;

let controllers = []; // AbortController pool

function sum(arr) {
    return arr.reduce((a, b) => a + b, 0);
}

/** ---------------------------
 * 下载线程（优化版）
 * --------------------------*/
async function start_thread(index) {
    const controller = new AbortController();
    controllers[index] = controller;

    try {
        const response = await fetch(testurl, {
            cache: "no-store",
            mode: "cors",
            referrerPolicy: "no-referrer",
            signal: controller.signal
        });

        if (!response.body) return;

        const reader = response.body.getReader();

        while (run) {
            const { value, done } = await reader.read();

            if (done) break;

            if (value) {
                thread_down[index] += value.length;
            }
        }

        reader.releaseLock();
    } catch (err) {
        if (run) {
            setTimeout(() => start_thread(index), 1000);
        }
    }
}

/** ---------------------------
 * 速度计算
 * --------------------------*/
function cale() {
    if (!run) return;

    const now = Date.now();
    const all = sum(thread_down);
    const delta = all - lsat_all_down;
    const dt = now - lsat_date || 1;

    const speed = (delta / dt) * 1000;

    now_speed = speed;

    if (visibl) {
        document.getElementById("speed").innerText =
            format(speed, ["B/s", "KB/s", "MB/s", "GB/s"]);

        document.getElementById("mbps").innerText =
            format(speed * 8, ["bps", "Kbps", "Mbps", "Gbps"]);
    }

    lsat_all_down = all;
    lsat_date = now;

    setTimeout(cale, 1000);
}

/** ---------------------------
 * 总流量统计
 * --------------------------*/
function total() {
    if (!run) return;

    const all = sum(thread_down);

    if (visibl) {
        document.getElementById("total").innerText =
            format(all, ["B", "KB", "MB", "GB"]);
    }

    if (Maximum > 0 && all >= Maximum) {
        stop();
        return;
    }

    setTimeout(total, 300);
}

/** ---------------------------
 * 启动
 * --------------------------*/
async function start() {
    maxtheard = Number(document.getElementById("thread").value);
    testurl = document.getElementById("link").value.trim();

    if (!checkURL(testurl)) {
        alert("链接不合法");
        return;
    }

    document.getElementById("do").innerText = "检测中...";
    document.getElementById("do").disabled = true;

    try {
        const r = await fetch(testurl, { mode: "cors" });
        if (!r.body) throw new Error("no body");
    } catch (e) {
        alert("链接不可用或存在跨域限制");
        document.getElementById("do").innerText = "开始";
        document.getElementById("do").disabled = false;
        return;
    }

    run = true;
    start_time = Date.now();

    thread_down = new Array(maxtheard).fill(0);
    controllers = [];

    lsat_all_down = 0;
    lsat_date = Date.now();

    document.getElementById("do").innerText = "停止";
    document.getElementById("do").disabled = false;

    for (let i = 0; i < maxtheard; i++) {
        start_thread(i);
    }

    cale();
    total();
}

/** ---------------------------
 * 停止
 * --------------------------*/
function stop() {
    run = false;

    controllers.forEach(c => {
        try { c?.abort(); } catch {}
    });

    document.getElementById("do").innerText = "开始";
}

/** ---------------------------
 * UI
 * --------------------------*/
function botton_clicked() {
    run ? stop() : start();
}

/** ---------------------------
 * URL校验
 * --------------------------*/
function checkURL(url) {
    try {
        const u = new URL(url);
        return u.protocol === "https:";
    } catch {
        return false;
    }
}

/** ---------------------------
 * 格式化
 * --------------------------*/
function format(bytes, units) {
    let i = 0;
    let v = bytes;

    while (v >= 1024 && i < units.length - 1) {
        v /= 1024;
        i++;
    }

    return v.toFixed(2) + " " + units[i];
}

/** ---------------------------
 * visibility
 * --------------------------*/
document.addEventListener("visibilitychange", () => {
    visibl = document.visibilityState === "visible";
    document.title = visibl ? "流量消耗器" : document.title;

    if (!visibl && run) stop();
});

/** ---------------------------
 * ping（修复URL bug）
 * --------------------------*/
function ping(id, url) {
    setTimeout(async () => {
        if (!visibl) return ping(id, url);

        const t = Date.now();
        try {
            await fetch(url, { method: "HEAD", mode: "no-cors" });
            const ms = Date.now() - t;
            document.getElementById(id).innerText = ms + "ms";
        } catch {
            document.getElementById(id).innerText = "-ms";
        }

        ping(id, url);
    }, 2000);
}

ping("laycn", "https://www.baidu.com/");
ping("laygb", "https://cp.cloudflare.com/");
ping("github", "https://github.com/");
ping("youtube", "https://www.youtube.com/");
