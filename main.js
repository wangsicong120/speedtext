var maxtheard;
var testurl;
var lsat_date = 0;
var all_down_sum = 0;
var run = false;
var checkIP = true;
var visibl = true;
var thread_down = [];
var lsat_all_down = 0;
var refresh_lay = 5000;

var now_speed = 0;
var now_local_ping = 0;
var now_global_ping = 0;
var start_time = 0; // 优化：显式声明全局 start_time，避免严格模式报错

async function start_thread(index) {
    try {
        const response = await fetch(testurl, { cache: "no-store", mode: 'cors', referrerPolicy: 'no-referrer' });
        const reader = response.body.getReader();
        while (true) {
            const { value, done } = await reader.read();
            if (done) {
                // stream 已经结束，无需额外 cancel
                start_thread(index);
                break;
            }
            if (!run) {
                await reader.cancel(); // 优化：加入 await 确保流正常关闭
                break;
            }
            if (value) {
                thread_down[index] += value.length;
            }
        }
    } catch (err) {
        console.error(err);
        // 优化：网速过快或报错时添加延时，防止因频繁失败导致调用栈溢出或浏览器卡死
        if (run) {
            setTimeout(() => start_thread(index), 1000);
        }
    }
}

async function cale() {
    var all_down_a = sum(thread_down);
    var current_time = new Date().getTime();
    var time_diff = current_time - lsat_date;
    
    // 优化：防止极端情况下分母为 0 导致计算出 NaN 或 Infinity
    if (time_diff <= 0) time_diff = 1;

    now_speed = (all_down_a - lsat_all_down) / time_diff * 1000 / 1024 / 1024;
    
    if (visibl) document.getElementById("speed").innerText = show((all_down_a - lsat_all_down) / time_diff * 1000, ['B/s', 'KB/s', 'MB/s', 'GB/s', 'TB/s', 'PB/s'], [0, 0, 1, 2, 2, 2]);
    if (visibl) document.getElementById("mbps").innerText = show((all_down_a - lsat_all_down) / time_diff * 8000, ['Bps', 'Kbps', 'Mbps', 'Gbps', 'Tbps', 'Pbps'], [0, 0, 0, 2, 2, 2]);
    if (!visibl) document.title = show((all_down_sum + all_down_a), ['B', 'KB', 'MB', 'GB', 'TB', 'PB'], [0, 0, 0, 2, 2, 2]) + ' ' + show((all_down_a - lsat_all_down) / time_diff * 1000, ['B/s', 'KB/s', 'MB/s', 'GB/s', 'TB/s', 'PB/s'], [0, 0, 0, 2, 2, 2]);
    
    lsat_all_down = all_down_a;
    lsat_date = current_time;
    
    if (run) {
        setTimeout(cale, 1000);
    } else {
        var avg_diff = current_time - start_time;
        if (avg_diff <= 0) avg_diff = 1;
        var avg_speed = 1000 * (all_down_a) / avg_diff;

        document.title = '流量消耗器';
        now_speed = 0;
        document.getElementById("speed").innerText = show((avg_speed), ['B/s', 'KB/s', 'MB/s', 'GB/s', 'TB/s', 'PB/s'], [0, 0, 1, 2, 2, 2]);
        document.getElementById("mbps").innerText = show((avg_speed) * 8, ['Bps', 'Kbps', 'Mbps', 'Gbps', 'Tbps', 'Pbps'], [0, 0, 0, 2, 2, 2]);
        lsat_all_down = 0;
        document.getElementById('describe').innerText = '平均速度';
    }
}

async function total() {
    var all_down = sum(thread_down);
    if (visibl) document.getElementById("total").innerText = show((all_down_sum + all_down), ['B', 'KB', 'MB', 'GB', 'TB', 'PB'], [0, 0, 1, 2, 2, 2]);
    
    // 优化：安全检测全局变量 Maximum 是否定义
    var current_max = typeof Maximum !== 'undefined' ? Maximum : 0;
    if ((all_down_sum + all_down) >= current_max && current_max != 0) stop();
    
    if (run) {
        setTimeout(total, 16);
    } else {
        all_down_sum += all_down;
        document.getElementById("total").innerText = show((all_down_sum), ['B', 'KB', 'MB', 'GB', 'TB', 'PB'], [0, 0, 1, 2, 2, 2]);
    }
}

async function start() {
    var current_max = typeof Maximum !== 'undefined' ? Maximum : 0;
    if (all_down_sum >= current_max && current_max != 0) {
        all_down_sum = 0;
    }
    maxtheard = document.getElementById("thread").value;
    testurl = document.getElementById("link").value;
    if (!testurl || testurl.length < 10) {
        alert("链接不合法");
        return;
    }
    testurl = testurl.substring(0, 5).toLowerCase() + testurl.substring(5, testurl.length);
    if (!checkURL(testurl)) {
        alert("链接不合法");
        return;
    }
    if (testurl.startsWith("http://")) {
        alert("由于浏览器安全限制，不支持http协议，请使用https协议");
        return;
    }
    if (!testurl.startsWith("https://")) {
        alert("链接不合法");
        return;
    }
    document.getElementById('do').innerText = '正在检验链接...';
    document.getElementById('do').disabled = true;

    try {
        const response = await fetch(testurl, { cache: "no-store", mode: 'cors', referrerPolicy: 'no-referrer' });
        const reader = response.body.getReader();
        const { value, done } = await reader.read();
        // 优化：防止响应体为空或直接结束时 value 为 undefined 导致崩溃
        if (!value || value.length <= 0) throw "资源响应异常";
        reader.cancel();
    } catch (err) {
        console.warn(err);
        document.getElementById('do').innerText = '开始';
        document.getElementById('do').disabled = false;
        alert("该链接不可用，如果你能够正常访问该链接，那么很有可能是浏览器的跨域限制");
        return;
    }
    document.getElementById('describe').innerText = '实时速度';
    document.getElementById('do').innerText = '停止';
    document.getElementById('do').disabled = false;
    var num = maxtheard;
    lsat_all_down = 0;
    start_time = new Date().getTime();
    run = true;
    thread_down = [];
    while (num--) {
        thread_down[num] = 0;
        start_thread(num);
    }
    cale();
    total();
}

function stop() {
    run = false;
    document.getElementById('do').innerText = '开始';
}

function sum(arr) {
    var s = 0;
    for (var i = 0; i < arr.length; i++) {
        s += arr[i];
    }
    return s;
}

function botton_clicked() {
    if (run) {
        stop();
    } else {
        start();
    }
}

function checkURL(URL) {
    var str = URL;
    var Expression = /http(s)?:\/\/([\w-]+\.)+[\w-]+(\/[\w- .\/?%&=]*)?/;
    var objExp = new RegExp(Expression);
    return objExp.test(str);
}

var cnip = '';

function ipcn() {
    if (visibl) {
        fetch('https://myip.ipip.net')
            .then(response => response.text())
            .then(text => {
                const tag = document.getElementById("ipcn");
                const ipInfo = parseIpInfo(text);

                tag.innerText = `${ipInfo.ip} ${ipInfo.country} ${ipInfo.region} ${ipInfo.city} ${ipInfo.isp}`.trim().replace(/\s+/g, ' ');

                if (ipInfo.ip !== cnip) {
                    tag.style.color = '';
                    if (typeof ckip === 'function') ckip(ipInfo.ip, tag);
                }
                cnip = ipInfo.ip;
            })
            .catch(error => {
                console.error("IP 获取失败:", error);
            })
            // 优化：将定时器放到 promise 链最后，避免网络卡顿引发请求堆积
            .finally(() => {
                setTimeout(ipcn, 5000);
            });
    } else {
        setTimeout(ipcn, 5000);
    }
}

// 优化：增强正则健壮性，防止空格数量变动或个别区域字段缺失导致解析返回“未知”
function parseIpInfo(text) {
    const regex = /当前\s*IP：(\S+)\s+来自于：(\S+)\s+(\S+)\s+(\S+)\s+(\S+)/;
    const match = text.match(regex);

    if (match) {
        return { ip: match[1], country: match[2], region: match[3], city: match[4], isp: match[5] };
    }

    // 备用宽松匹配
    const relaxedRegex = /当前\s*IP：(\S+)\s+来自于：(.*)/;
    const relaxedMatch = text.match(relaxedRegex);
    if (relaxedMatch) {
        const parts = relaxedMatch[2].trim().split(/\s+/);
        return {
            ip: relaxedMatch[1],
            country: parts[0] || '未知',
            region: parts[1] || '',
            city: parts[2] || '',
            isp: parts[3] || ''
        };
    }

    return { ip: '未知', country: '未知', region: '未知', city: '未知', isp: '未知' };
}

var gbip = "";

function ipgb() {
    if (visibl) {
        fetch('https://ipinfo.io/json')
            .then(response => response.json())
            .then(data => {
                var tag = document.getElementById("ipgb");
                tag.innerText = (data['ip'] || '') + ' ' + (data['country'] || '') + ' ' + (data['region'] || '') + ' ' + (data['city'] || '') + ' ' + (data['hostname'] || '');
                
                if (data['ip'] !== gbip) {
                    tag.style.color = '';
                    if (typeof ckip === 'function') ckip(data['ip'], tag);
                }
                gbip = data['ip'];
            })
            .catch(error => {
                console.error("IP 获取失败:", error);
            })
            .finally(() => {
                setTimeout(ipgb, refresh_lay);
            });
    } else {
        setTimeout(ipgb, refresh_lay);
    }
}

// 优化：修改所有测速函数的定时调度机制，改在 finally 中触发，防止请求堆积
function laycn() {
    if (visibl) {
        var start_ti = new Date().getTime();
        fetch("https://www.baidu.com/", { method: "HEAD", cache: "no-store", mode: 'no-cors', referrerPolicy: 'no-referrer' })
            .then(function() {
                var lay = new Date().getTime() - start_ti;
                now_local_ping = lay;
                document.getElementById("laycn").innerText = lay + 'ms';
            })
            .catch(error => document.getElementById("laycn").innerText = '-ms')
            .finally(() => {
                setTimeout(laycn, 2000);
            });
    } else {
        setTimeout(laycn, 2000);
    }
}

function laygb() {
    if (visibl) {
        var start_ti = new Date().getTime();
        fetch("https://cp.cloudflare.com/", { method: "HEAD", cache: "no-store", mode: 'no-cors', referrerPolicy: 'no-referrer' })
            .then(function() {
                var lay = new Date().getTime() - start_ti;
                now_global_ping = lay;
                document.getElementById("laygb").innerText = lay + 'ms';
            })
            .catch(error => document.getElementById("laygb").innerText = '-ms')
            .finally(() => {
                setTimeout(laygb, 2000);
            });
    } else {
        setTimeout(laygb, 2000);
    }
}

function laygithub() {
    if (visibl) {
        var start_ti = new Date().getTime();
        fetch("https://github.com/", { method: "HEAD", cache: "no-store", mode: 'no-cors', referrerPolicy: 'no-referrer' })
            .then(function() {
                var lay = new Date().getTime() - start_ti;
                document.getElementById("github").innerText = lay + 'ms';
            })
            .catch(error => document.getElementById("github").innerText = '-ms')
            .finally(() => {
                setTimeout(laygithub, 2000);
            });
    } else {
        setTimeout(laygithub, 2000);
    }
}

function layyoutube() {
    if (visibl) {
        var start_ti = new Date().getTime();
        fetch("https://www.youtube.com/", { method: "HEAD", cache: "no-store", mode: 'no-cors', referrerPolicy: 'no-referrer' })
            .then(function() {
                var lay = new Date().getTime() - start_ti;
                document.getElementById("youtube").innerText = lay + 'ms';
            })
            .catch(error => document.getElementById("youtube").innerText = '-ms')
            .finally(() => {
                setTimeout(layyoutube, 2000);
            });
    } else {
        setTimeout(layyoutube, 2000);
    }
}

// 初始化执行
ipcn();
ipgb();
laycn();
laygb();
laygithub();
layyoutube();

document.addEventListener("visibilitychange", function() {
    var string = document.visibilityState;
    if (string === 'hidden') {
        visibl = false;
        // 优化：安全获取页面元素，防止元素不存在时引发 Null 报错
        var customSwitch = document.getElementById("customSwitch2");
        if (run && (!customSwitch || !customSwitch.checked)) botton_clicked();
    }
    if (string === 'visible') {
        visibl = true;
        document.title = "流量消耗器";
    }
});

var chartDom = document.getElementById('dv');
var myChart = echarts.init(chartDom);
var option;

option = {
    tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross', label: { backgroundColor: '#6a7985' } }
    },
    legend: { data: ['速率', '百度', 'Cloudflare'] },
    toolbox: { feature: { saveAsImage: {} } },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: [{ type: 'time', name: "时间", boundaryGap: false, axisLabel: { show: false } }],
    yAxis: [
        { type: 'value', name: "延迟 (ms)", splitLine: { show: false } },
        { type: 'value', name: "速率 (MB/s)", splitLine: { show: false } }
    ],
    series: [
        { name: '速率', type: 'line', yAxisIndex: 1, areaStyle: {}, emphasis: { focus: 'series' }, data: [] },
        { name: '百度', type: 'line', data: [] },
        { name: 'Cloudflare', type: 'line', data: [] }
    ]
};

option && myChart.setOption(option);

function dv() {
    if (visibl) {
        let now = new Date();

        option.series[0].data.push({
            name: now.toString(),
            value: [now.getTime(), parseFloat(now_speed).toFixed(1)]
        });
        option.series[1].data.push({
            name: now.toString(),
            value: [now.getTime(), now_local_ping]
        });
        option.series[2].data.push({
            name: now.toString(),
            value: [now.getTime(), now_global_ping]
        });

        // 优化：防止内存泄漏！如果图表长时间运行，数组无限膨胀会导致页面崩溃。这里限制保留最新的 100 个数据点。
        const MAX_POINTS = 100;
        if (option.series[0].data.length > MAX_POINTS) {
            option.series[0].data.shift();
            option.series[1].data.shift();
            option.series[2].data.shift();
        }

        myChart.setOption({
            series: option.series
        });
    }
    setTimeout(dv, 1000);
}

dv();
