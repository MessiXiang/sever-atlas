# 数据维护

本网站的 data/flights.json 是已复核的结构化资料。修改后执行：

    python3 maintenance/publish_data.py

该命令先做数据完整性检查，再生成直接打开网页所需的 flights.js、experiences.js 和 remote-routes.js。不会更改 asOf，也不会自动宣称新的核查日期。

## 公开售票航线与体验项目

- `recordKind=service` 表示已确认售票渠道的航线资料。必须保留 `scheduleUnconfirmed=true`、空 `days`、空时刻；没有具体日期的服务不进入日期筛选或衔接计算。已核实的单日班次另存为 `recordKind=timetable`，不要把一个日期扩展为长期星期表。
- `booking.channel` 区分 `online` 和 `online-office`；`booking.links` 可补充代理及柜台联系入口。售票渠道核实不等于当前有余票。
- `data/experiences.json` 独立保存观光、特技与包机项目，按 `model` 分组，不并入客运时刻。报价保留币种与 `basis`，尤其不能把整机或整组每小时价格当作单人总价。
- 体验项目的公开报价、联系方式与原文快照由 `maintenance/validate_experiences.py` 校验。九国导入范围和证据哈希见 `data/neighbour-integration-audit.json`；源文件更新时同步审核哈希，不绕过校验。

## 取回一组官网原始结果

以下只读查询只保存新快照，不覆盖已复核数据；不需要密钥：

    python3 maintenance/fetch_websky.py --carrier 6r --origin MJZ --destination ULK --output refresh/6r-MJZ-ULK.json

carrier 允许6r（ALROSA）、kv（KrasAvia）、wz（Red Wings）。请求使用未分组结果，便于核对日期和时间。可先参考原始查询模板及 data 目录的抓取日志。遇429应停止并等待，不能持续密集重试。

## 记录结构

- airports：稳定ID、IATA/ICAO、俄文/中文名、纬度/经度、IANA时区、coordinateSource、coordinateStatus、tzVerified。
- flights：id、airline（实际运营方）、number（来源原号，可为营销号）、from/to、aircraft、departure/arrival（当地时间）、days（周一1至周日7）、start/end、dates（具体日期）、source/sourceLocator/localSource、status、note。
- arrivalDayOffset：到达地日历日期相对出发地日历日期的偏移；arrivalDayBasis记录推导依据。
- durationMinutes：来源飞行时长，用来校验时区和到达时间，不使用原站错误显示的巨额时长。
- route / routeKind：经停、链式或整条环线；缺失中途时间不补造。
- excludedDates / conflictDates：取消日期、同日多版本冲突日期；后者不可计算可靠衔接。
- publicAccess=unverified：散客资格未核实，默认隐藏。
- status=confirmed：来源明确入选机型（含L-410，可能为多个候选型号范围）；mixed：存在替换机型或运营方不确定；fleet-supported：机队交叉佐证；conflict：来源方向等存在冲突。

## 更新规则

1. 从官方来源重新取表，保留原件和时间；不要只更新页面日期。
2. 先检查计划有效期，指定日期优先，保留取消与加班、隔周和季节变化。
3. 保留实际运营方。转机查询的后续航段日期可能相对首段偏移，不能直接当成该航段独立日期；优先查询该OD的单段结果。
4. 机队含某型号不能证明每条航线都用它。入选机型白名单包含L-410，仍排除波音、空客、ATR等。官网标TU 204/214时，aircraft保存[Tu-204,Tu-214]，不可猜测具体子型号；范围外或承运方不明的替代机型放alternatives。
5. airport代码有城市码、过时代码和碰撞；用机场ICAO/位置复核，不靠名字猜精确起降点。
6. 修改flights.json后执行publish_data.py，浏览器复查地图、日期、行程和来源链接。
7. 保存新的sources原件、source-manifest.json与coverage记录。抓取新结果不等同审核完成。

完整最初解析脚本保存在本工作区 work/build_data.py、work/finalize.py，依赖同目录原始资料；交付维护脚本可直接在本目录单独使用，不依赖那些开发路径。

8. 多机场城市必须检查具体机场代码：本次MOW城市码未返回ZIA的Tu系列结果，直接查询ZIA才能取得。新增机场级结果应优先，并按实际航段键避免重复。
9. 运营状态需要官网公告交叉核实：名录内的Izhavia已于2026年8月1日停止自营，不能仅因旧名录或历史Yak-42机队而重新补入现行班次。

10. 三字符 IATA 不等于 OurAirports ident：NYA 必须对应 USHN；Бурный 必须结合航司 БУЫ、埃文基地域和相邻航段，不能自动配成 ULSJ。村镇点保留 coordinateStatus=settlement。
11. 更改机场或航班 ID 时更新 airportAliases / flightAliases，保留浏览器旧筛选和行程；执行地理回归校验。

12. 亚马尔直升机与YC/LLM分开。Mi-8T单列并用aircraftParent=Mi-8；scheduleUnconfirmed不展开日期，unconfirmedDates保留原星号并排除确定日期匹配，timeBasis=unconfirmed不计算可靠衔接。不得以checkedAt补造有效期。
