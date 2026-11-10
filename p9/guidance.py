"""“怎么引导这个学生”：基于证据的规则引擎 + 教师评语模板。

每条建议都写明依据了哪几项证据、可信度和定级理由。可信度规则（页面上同样展示）：
- 高：至少 3 项相互独立的证据指向同一结论，且样本量足够；
- 中：2 项证据一致，或 1 项证据但统计不确定性已量化且较小；
- 低：只有 1 项证据，或证据本身的个体区分力有限（例如心理健康的群体风险因素）。
评语是模板拼接的示例，不调用大模型；页面上同时展示“如果接入大模型，会发送的结构化提示”。
"""
from __future__ import annotations

import numpy as np

KC_ACTIONS = {
    "num": "从有理数、整式的基本运算律入手，每天 3–5 道分层计算题，要求写出每一步依据",
    "eq": "用“等式性质 → 移项 → 去括号 → 去分母”的顺序做变式练习，并用代入检验答案",
    "func": "画表格—描点—连线，把解析式、表格、图像三种表示对照起来；再做两道情境应用题",
    "geo": "先梳理判定定理和性质定理的条件，练习“已知—求证—证明”的规范书写",
    "trans": "用坐标纸动手做平移、旋转、轴对称，比较变换前后坐标的变化规律",
    "stat": "从身边数据（如班级作息调查）出发，练习整理数据、画统计图并解释结论",
}
DIM_LABEL = {"content": "内容/立意", "language": "语言表达", "organization": "结构/连贯", "development": "思想深度/论证",
             "accuracy": "答案正确", "conventions": "书写规范", "process": "解题过程"}
DIM_ACTIONS = {
    "content": "动笔前先用 3 分钟列提纲：中心句 + 2–3 个要点，写完对照题目检查是否切题",
    "language": "建立“好句积累本”，每周仿写 3 个句式；订正时把语法/用词错误按类型归档",
    "organization": "练习段首中心句和 first/then/however 等衔接词，写完画出段落结构图",
    "development": "每个观点配一个具体事例或数据，并追问一句“为什么”",
    "accuracy": "错题按“概念/计算/审题”三类归因，同类题隔天再做一次",
}
CONF_ORDER = {"高": 3, "中": 2, "低": 1}


def _conf(n_agree: int, small_sample: bool = False) -> str:
    c = "高" if n_agree >= 3 else ("中" if n_agree == 2 else "低")
    if small_sample and c != "低":
        c = "中" if c == "高" else "低"
    return c


def build(st: dict, class_mean: dict, kcs: list[dict]) -> list[dict]:
    out = []
    K = len(kcs)
    bkt = np.array(st["kt"]["bkt"][-1])
    dkt = np.array(st["kt"]["dkt"][-1])
    cdm = np.array(st["cdm"]["attr_posterior"], float)
    nkc = st["kt"]["n_by_kc"]
    # 1. 知识点薄弱
    score = (bkt + dkt + cdm) / 3
    weak = [k for k in np.argsort(score) if (bkt[k] < 0.6 or cdm[k] < 0.5 or dkt[k] < 0.6)][:2]
    for k in weak:
        ev = []
        ev.append({"source": "知识追踪 · BKT", "text": f"「{kcs[k]['name']}」掌握概率 {bkt[k]:.2f}（阈值 0.60）",
                   "agrees": bool(bkt[k] < 0.6)})
        ev.append({"source": "知识追踪 · DKT-lite", "text": f"预测下一题答对率 {dkt[k]:.2f}", "agrees": bool(dkt[k] < 0.6)})
        ev.append({"source": "认知诊断 · DINA", "text": f"属性掌握后验 {cdm[k]:.2f}（阈值 0.50）", "agrees": bool(cdm[k] < 0.5)})
        n_ag = sum(e["agrees"] for e in ev)
        small = nkc[k] < 6
        out.append({"category": "知识", "title": f"补强「{kcs[k]['name']}」",
                    "action": KC_ACTIONS[kcs[k]["id"]] + "。两周后用自适应小测复查。",
                    "evidence": ev, "confidence": _conf(n_ag, small),
                    "confidence_reason": f"{n_ag}/3 项证据一致；该知识点本学期作答 {nkc[k]} 次" + ("，样本偏少，降一级" if small and n_ag >= 2 else "")})
    # 2. 优势
    strong = [k for k in range(K) if bkt[k] > 0.85 and dkt[k] > 0.75 and cdm[k] > 0.8]
    if strong:
        k = max(strong, key=lambda k: score[k])
        out.append({"category": "优势", "title": f"发挥「{kcs[k]['name']}」的优势",
                    "action": "安排一道拓展探究题，或请他/她在小组里讲解一道典型题（讲给别人听是很好的巩固）。",
                    "evidence": [{"source": "知识追踪 · BKT", "text": f"掌握概率 {bkt[k]:.2f}", "agrees": True},
                                 {"source": "知识追踪 · DKT-lite", "text": f"预测答对率 {dkt[k]:.2f}", "agrees": True},
                                 {"source": "认知诊断 · DINA", "text": f"属性掌握后验 {cdm[k]:.2f}", "agrees": True}],
                    "confidence": _conf(3, nkc[k] < 6), "confidence_reason": f"3/3 项证据一致；作答 {nkc[k]} 次"})
    # 3. 作业分项（p4 量规）
    hs = st["homework_summary"]
    cdims = class_mean.get("homework_dims", {})
    if hs["n"] == 0:
        if st["from_p4"] and "basic" not in st["p4_consent"]:
            out.append({"category": "合规", "title": "先与家长沟通授权",
                        "action": "监护人尚未签署同意，作业 AI 评阅未启用。请先当面说明用途、可见范围和撤回方式，取得书面同意后再开启。",
                        "evidence": [{"source": "授权记录（来自 p4 演示数据）", "text": "未签署基本处理同意", "agrees": True}],
                        "confidence": "高", "confidence_reason": "这是授权状态，不是推断"})
    else:
        gaps = []
        for d, v in hs["dims"].items():
            if d in DIM_ACTIONS and cdims.get(d) is not None:
                gaps.append((100 * v - cdims[d], d, v))
        if gaps:
            gap, d, v = min(gaps)
            if gap <= -8:
                n_hw = hs["n"]
                src = "p4 演示流水线（mock 评分 + 模拟复核）" if st["from_p4"] else "合成作业数据（按 p4 量规结构）"
                ev = [{"source": "作业量规分项", "text": f"「{DIM_LABEL[d]}」平均得分率 {100 * v:.0f}%，班级 {cdims[d]:.0f}%（差 {-gap:.0f} 个百分点）",
                       "agrees": True},
                      {"source": "数据来源", "text": f"{n_hw} 次作业，{src}", "agrees": True}]
                out.append({"category": "作业", "title": f"提升作业的「{DIM_LABEL[d]}」",
                            "action": DIM_ACTIONS[d] + "。", "evidence": ev,
                            "confidence": "中" if (n_hw >= 3 and gap <= -10) else "低",
                            "confidence_reason": "单一来源（作业评分），但跨多次作业一致" if n_hw >= 3 else "作业次数少"})
    # 4. 成绩趋势
    ys = [y for y in st["growth"]["academic"] if y is not None]
    if len(ys) >= 4:
        slope = float(np.polyfit(np.arange(len(ys)), ys, 1)[0])
        resid = float(np.std(np.array(ys) - np.polyval(np.polyfit(np.arange(len(ys)), ys, 1), np.arange(len(ys)))))
        if slope <= -0.8:
            out.append({"category": "趋势", "title": "近期周测成绩在下滑，先了解原因",
                        "action": "找一个轻松的时间聊一聊最近的学习节奏和作息；先不急于加练，确认是知识问题还是状态问题。",
                        "evidence": [{"source": "周测成绩", "text": f"7 个时间点线性斜率 {slope:+.1f} 分/周（残差标准差 {resid:.1f}）", "agrees": True}],
                        "confidence": "中" if abs(slope) > 2 * resid / np.sqrt(len(ys)) else "低",
                        "confidence_reason": "斜率与波动幅度相比" + ("较明显" if abs(slope) > 2 * resid / np.sqrt(len(ys)) else "不够明显，可能是正常波动")})
        elif slope >= 0.8:
            out.append({"category": "趋势", "title": "进步明显，及时具体地肯定",
                        "action": "表扬时说清楚进步在哪里（例如“函数题的步骤更完整了”），比笼统表扬更有效。",
                        "evidence": [{"source": "周测成绩", "text": f"线性斜率 {slope:+.1f} 分/周", "agrees": True}],
                        "confidence": "中", "confidence_reason": "单一来源，但趋势持续 6 周"})
    # 5. 学习行为
    beh = st["behavior"]
    if beh["on_time"][-1] is not None and beh["on_time"][-1] < 0.8:
        out.append({"category": "行为", "title": "作业按时提交需要支持",
                    "action": "和学生一起把每天的作业拆成 2–3 个小块，写在便签上逐项打勾；家校沟通时聚焦“完成了什么”。",
                    "evidence": [{"source": "作业提交记录", "text": f"本学期按时提交率 {100 * beh['on_time'][-1]:.0f}%", "agrees": True}],
                    "confidence": "高", "confidence_reason": "直接观测的行为记录，不是推断"})
    if beh["practice"][-1] < 6:
        out.append({"category": "行为", "title": "课后练习量偏少",
                    "action": "从每天 2 道题起步，优先选自适应测验推荐的难度（答对率约 60%–70% 的题）。",
                    "evidence": [{"source": "练习记录", "text": f"第 6 周练习 {beh['practice'][-1]} 题（班级平均 {class_mean.get('practice_per_week', 0):.0f} 题/周）", "agrees": True}],
                    "confidence": "高", "confidence_reason": "直接观测的行为记录"})
    # 6. 自适应测验
    tr = st["cat"]["trace"][-1]
    lo, hi = tr["eap"] - 1.96 * tr["psd"], tr["eap"] + 1.96 * tr["psd"]
    if tr["psd"] > 0.42:
        out.append({"category": "测验", "title": "能力估计还不够确定，建议再测一次",
                    "action": "再做一次 10 题自适应测验，或把两次结果合并估计后再据此分层。",
                    "evidence": [{"source": "自适应测验 · IRT/EAP", "text": f"θ = {tr['eap']:+.2f}，95% 区间 [{lo:+.2f}, {hi:+.2f}]（宽 {hi - lo:.2f}）", "agrees": True}],
                    "confidence": "中", "confidence_reason": "不确定性已量化：后验标准差 " + f"{tr['psd']:.2f}"})
    else:
        out.append({"category": "测验", "title": "按能力区间选择练习难度",
                    "action": f"练习题优先选 IRT 难度 b 在 {tr['eap'] - 0.5:+.1f} 到 {tr['eap'] + 0.5:+.1f} 之间的题（“跳一跳够得着”）。",
                    "evidence": [{"source": "自适应测验 · IRT/EAP", "text": f"θ = {tr['eap']:+.2f}，95% 区间 [{lo:+.2f}, {hi:+.2f}]", "agrees": True}],
                    "confidence": "中", "confidence_reason": f"10 题后后验标准差 {tr['psd']:.2f}"})
    # 7. 心理健康（只做群体层面的普遍性支持）
    if st["psych_flag"] == "建议关注":
        out.append({"category": "关怀", "title": "以日常关心为主，提供普遍性支持",
                    "action": "班主任用日常方式了解近况（睡眠、同伴、家庭支持）；告知学校心理老师的预约方式；"
                              "不在班级公开、不与成绩或评优挂钩、不据此对学生作任何判断；学生主动求助时按校内转介流程处理。",
                    "evidence": [{"source": "群体风险因素（p3 风险计算器）", "text": "家庭与作息类风险因素较多（全校前 20%）", "agrees": True},
                                 {"source": "方法局限（p3 实测）", "text": "个体区分力有限：AUC 上限约 0.71，真实开放数据 0.57；前 20% 名单中约 53% 并非筛查阳性", "agrees": False}],
                    "confidence": "低", "confidence_reason": "群体层面的风险因素，不是诊断；只用于决定“先把普遍性支持送到哪里”"})
    out.sort(key=lambda x: -CONF_ORDER[x["confidence"]])
    return out


def teacher_comment(st: dict, kcs: list[dict]) -> dict:
    """模板评语（示例）。同时给出接入大模型时会发送的结构化证据，便于老师判断模型有没有“编”。"""
    name = st["name"]
    g = st["guidance"]
    strengths = [x["title"].replace("发挥", "").replace("的优势", "") for x in g if x["category"] == "优势"]
    weak = [x["title"].replace("补强", "") for x in g if x["category"] == "知识"]
    trend = next((x for x in g if x["category"] == "趋势"), None)
    parts = [f"{name}同学，这六周你一直在坚持。"]
    if strengths:
        parts.append(f"你在{strengths[0]}上掌握得很扎实，可以试着给同学讲一讲。")
    if trend and "进步" in trend["title"]:
        parts.append("周测成绩稳步上升，说明你的方法是对的。")
    if weak:
        parts.append(f"接下来我们一起把{'和'.join(weak)}再练扎实一些，每天几道题就够。")
    hw = next((x for x in g if x["category"] == "作业"), None)
    if hw:
        parts.append(f"作文方面，{hw['action'].split('，')[0]}，你会发现写起来更顺。")
    parts.append("有任何困难随时来找我。")
    prompt = {"role": "班主任", "student": name, "tone": "具体、温和、以鼓励为主，不出现分数排名，不涉及心理健康信息",
              "evidence": [{"title": x["title"], "confidence": x["confidence"], "evidence": [e["text"] for e in x["evidence"]]}
                           for x in g if x["category"] != "关怀"],
              "constraints": ["只能使用 evidence 里的事实", "不超过 120 字", "教师审核后才可发送"]}
    return {"text": "".join(parts), "kind": "模板生成的示例（未调用大模型）", "llm_prompt_preview": prompt}
