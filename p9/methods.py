"""前沿方法墙、信息可见范围矩阵、数据目录。页面上的文字都在这里，便于审阅。

成熟度标签只有三种：
- implemented：已在本演示中实现（在合成数据上真实计算）
- concept：概念演示（合成信号或流程演示，没有真实模型）
- research：仅研究阶段（只引用论文，本平台没有实现）
"""
from __future__ import annotations

MATURITY = {"implemented": "已在本演示中实现", "concept": "概念演示", "research": "仅研究阶段"}

METHODS = [
    {"id": "bkt", "group": "知识追踪", "name": "贝叶斯知识追踪 BKT", "maturity": "implemented",
     "one_line": "把每个知识点看成“会 / 不会”两种隐状态，用隐马尔可夫模型从作答序列推断掌握概率。",
     "where": "学生全景 → 知识追踪曲线；EM 在合成作答序列上逐知识点拟合 4 个参数", "refs": ["bkt"], "metric": "kt.bkt"},
    {"id": "pfa", "group": "知识追踪", "name": "表现因素分析 PFA", "maturity": "implemented",
     "one_line": "用“此前答对几次、答错几次”做逻辑回归，是 BKT 的常用对照基线。",
     "where": "模型对照表（同一份留出数据上的 AUC）", "refs": ["pfa"], "metric": "kt.pfa"},
    {"id": "dkt", "group": "知识追踪", "name": "深度知识追踪 DKT（小型化）", "maturity": "implemented",
     "one_line": "用循环神经网络读完整个作答历史，输出下一题在各知识点上答对的概率。",
     "where": "学生全景 → DKT 视角；本平台是 numpy 写的单层 tanh RNN（原论文用 LSTM），在合成数据上训练", "refs": ["dkt"], "metric": "kt.dkt"},
    {"id": "sakt", "group": "知识追踪", "name": "自注意力知识追踪 SAKT", "maturity": "research",
     "one_line": "用自注意力机制挑出与当前题最相关的历史作答，适合长序列、稀疏数据。",
     "where": "本平台未实现；作为后续接入真实大规模作答数据时的候选", "refs": ["sakt"]},
    {"id": "akt", "group": "知识追踪", "name": "上下文感知注意力知识追踪 AKT", "maturity": "research",
     "one_line": "在注意力里加入随时间衰减的“遗忘”项，并结合 Rasch 题目难度嵌入。",
     "where": "本平台未实现；候选方法", "refs": ["akt"]},
    {"id": "dina", "group": "认知诊断", "name": "DINA 认知诊断模型", "maturity": "implemented",
     "one_line": "根据 Q 矩阵（每道题考哪些知识点），从一次测验的对错推断学生掌握了哪些属性。",
     "where": "学生全景 → 认知诊断；24 题 × 6 属性，EM 估计失误率与猜对率", "refs": ["dina_junker", "dina_delatorre"], "metric": "cdm"},
    {"id": "neuralcd", "group": "认知诊断", "name": "神经认知诊断 NeuralCD", "maturity": "research",
     "one_line": "用神经网络学习学生与题目之间的交互函数，同时保持可解释的单调性约束。",
     "where": "本平台未实现；候选方法", "refs": ["neuralcd"]},
    {"id": "irt", "group": "自适应测验", "name": "项目反应理论 IRT（2PL）", "maturity": "implemented",
     "one_line": "每道题有区分度和难度两个参数；用边际极大似然 EM 在测试样本上标定题库。",
     "where": "120 题合成题库，用合成考生的作答标定（规模见下方指标）", "refs": ["bock_aitkin"], "metric": "irt"},
    {"id": "cat", "group": "自适应测验", "name": "计算机化自适应测验 CAT", "maturity": "implemented",
     "one_line": "每答一题就更新能力估计，再挑在当前能力处信息量最大的题；用更少的题得到更准的估计。",
     "where": "学生全景 → 自适应测验（可以自己作答）；EAP 估计 + 最大信息量选题", "refs": ["bock_mislevy", "weiss_kingsbury"], "metric": "cat"},
    {"id": "llm_grading", "group": "作业评阅", "name": "大模型作文 / 作业评阅", "maturity": "concept",
     "one_line": "按量规输出分项分、错误位置、评语和置信度，低置信度自动进入教师复核。",
     "where": "作业评阅页；流程来自 p4（已跑通，评分用规则 mock），真实大模型尚未实测", "refs": ["mizumoto", "ellipse"]},
    {"id": "llm_comment", "group": "作业评阅", "name": "大模型生成教师评语", "maturity": "concept",
     "one_line": "把结构化证据交给大模型写成评语，限定只能使用证据里的事实，教师审核后才发送。",
     "where": "学生全景 → 评语示例；本版是模板拼接，并展示将发送给大模型的结构化提示", "refs": ["kasneci"]},
    {"id": "guidance", "group": "引导建议", "name": "基于证据的引导建议", "maturity": "implemented",
     "one_line": "每条建议列出依据了哪几项证据、几项一致、样本量多少，再给出高 / 中 / 低可信度。",
     "where": "学生全景 → 引导建议；规则写在 p9/guidance.py", "refs": []},
    {"id": "group_risk", "group": "心理健康", "name": "群体心理风险估计（p3）", "maturity": "implemented",
     "one_line": "用文献 meta 分析的效应量估计各年级的预期筛查阳性率，用来分配普遍性心理支持资源。",
     "where": "群体心理页、校领导视图；只到年级层面，不做个体诊断", "refs": [], "metric": "psych"},
    {"id": "fairness", "group": "可信 AI", "name": "公平性检查", "maturity": "implemented",
     "one_line": "按性别、留守与否分组比较知识追踪模型的 AUC，检查模型对不同群体是否同样好用。",
     "where": "方法墙 → 模型对照；合规边界页", "refs": ["baker_bias"], "metric": "kt.fairness"},
    {"id": "mm_engagement", "group": "多模态学习分析", "name": "课堂参与度分析", "maturity": "concept",
     "one_line": "综合姿态、发言、互动等信号估计班级层面的参与度变化，帮助老师调整教学节奏。",
     "where": "驾驶舱 → 课堂参与度（概念）；只用合成曲线，班级层面，不到个人", "refs": ["mmla_ochoa", "engagement_dmello", "daisee"],
     "demo": "engagement"},
    {"id": "mm_emotion", "group": "多模态学习分析", "name": "面部表情 / 情绪识别", "maturity": "concept",
     "one_line": "从面部动作推断情绪。本平台默认关闭：欧盟《人工智能法》禁止在教育机构推断情绪，科学可靠性也有争议。",
     "where": "只放示意动画（抽象点阵，不是人脸），不处理任何图像、不调用摄像头", "refs": ["barrett_emotion"],
     "legal": ["aia_5_1_f", "aia_rec_44", "pipl_28"], "demo": "emotion"},
    {"id": "mm_gaze", "group": "多模态学习分析", "name": "眼动追踪", "maturity": "concept",
     "one_line": "记录注视点和注视时长，分析学生在多媒体材料上把注意力放在哪里。",
     "where": "合成注视热力图示意；真实采集需要专门设备、知情同意和伦理审查", "refs": ["eyetracking_review"], "demo": "gaze"},
    {"id": "mm_speech", "group": "多模态学习分析", "name": "课堂语音与话语分析", "maturity": "concept",
     "one_line": "自动区分教师讲授、学生发言、讨论时段，给教师反馈课堂话语结构。",
     "where": "合成的“师生话语占比”曲线；不录音、不调用麦克风", "refs": ["teacher_discourse"], "demo": "speech"},
]

ROLES = [
    {"id": "student", "name": "学生", "who": "张小明（初二(3)班）"},
    {"id": "teacher", "name": "老师", "who": "王老师（初二(3)班 班主任）"},
    {"id": "parent", "name": "家长", "who": "张小明家长"},
    {"id": "leader", "name": "学校领导", "who": "星海实验中学（虚构）校长"},
    {"id": "bureau", "name": "教育局", "who": "示例区（虚构）教育局"},
]

# 信息可见范围：full=完整，own=只看自己/自己的孩子，class=本班个人，agg=汇总，none=不可见
VISIBILITY = {
    "columns": ["学生", "老师", "家长", "学校领导", "教育局"],
    "rows": [
        {"item": "学业成绩、作业分项", "cells": ["own", "class", "own", "agg", "agg"]},
        {"item": "知识追踪、认知诊断、自适应测验", "cells": ["own", "class", "own", "agg", "agg"]},
        {"item": "引导建议", "cells": ["own", "class", "own", "none", "none"]},
        {"item": "心理健康：个人“建议关注 / 普通”", "cells": ["none", "class", "none", "none", "none"]},
        {"item": "心理健康：年级层面的预期阳性率与风险因素占比", "cells": ["none", "none", "none", "agg", "none"]},
        {"item": "课堂参与度（概念演示）", "cells": ["none", "agg", "none", "agg", "none"]},
        {"item": "个人排名", "cells": ["none", "none", "none", "none", "none"]},
        {"item": "生物识别（人脸、表情、声纹、眼动）", "cells": ["none", "none", "none", "none", "none"]},
    ],
    "legend": {"own": "只看自己 / 自己的孩子", "class": "本班学生个人", "agg": "只看汇总（人数 <10 的格子不显示）",
               "none": "不可见"},
    "notes": ["心理健康信息不进入任何排名，也不出现在教育局视图。",
              "“建议关注”只对班主任可见，只用于决定先把普遍性支持送给谁，不对学生和家长出示，不与评优、分班挂钩。",
              "生物识别类功能默认关闭；本版不处理任何真实人脸、视频或语音。"],
}

DATA_CATALOG = [
    {"data": "作业照片、手写识别文字、量规评分", "use": "作业评阅、学业画像", "basis": "监护人同意（不满十四周岁）+ 告知学生",
     "default": "开启（需同意；未同意的学生自动关闭，见“刘洋”）", "clauses": ["pipl_31", "child_9", "school_10"]},
    {"data": "练习与测验作答记录", "use": "知识追踪、认知诊断、自适应测验", "basis": "监护人同意 + 告知学生；只用于教学",
     "default": "开启", "clauses": ["pipl_31", "moe_6"]},
    {"data": "云端大模型处理作业", "use": "大模型评阅（p4）", "basis": "监护人另外勾选“允许云端 AI 处理”",
     "default": "关闭（单独勾选后才开启）", "clauses": ["pipl_29", "minor_32"]},
    {"data": "家庭与作息情况（留守、寄宿、睡眠等）", "use": "群体层面的心理支持资源规划", "basis": "敏感个人信息：单独同意 + 监护人同意 + 影响评估",
     "default": "只做年级汇总；个人只给班主任“建议关注 / 普通”", "clauses": ["pipl_28", "pipl_29", "pipl_55"]},
    {"data": "人脸、表情、眼动、声纹等生物识别信息", "use": "（本平台不用）", "basis": "敏感个人信息；教育场景情绪识别在欧盟属于禁止做法",
     "default": "关闭，且本版没有实现", "clauses": ["aia_5_1_f", "pipl_28", "face_7", "pipl_26"]},
    {"data": "自动化生成的评价与建议", "use": "辅助教师，不直接决定学生权益", "basis": "透明、可解释，学生和家长可要求说明、可拒绝仅由自动化作出的决定",
     "default": "所有建议标明依据和可信度；评分须教师复核", "clauses": ["pipl_24", "aia_annex3_3"]},
]

PROHIBITED = [
    {"what": "在课堂上用摄像头识别学生情绪、专注度并据此打分", "why": "欧盟把教育机构中的情绪推断列为禁止做法；表情推断情绪的科学基础也有争议",
     "clauses": ["aia_5_1_f", "aia_3_39", "aia_rec_44"]},
    {"what": "用生物识别数据推断学生的种族、宗教、性取向等", "why": "欧盟禁止此类生物特征分类", "clauses": ["aia_5_1_g", "gdpr_9_1"]},
    {"what": "未经监护人同意处理不满十四周岁学生的信息", "why": "属于敏感个人信息，需要监护人同意和专门规则", "clauses": ["pipl_28", "pipl_31", "child_9"]},
    {"what": "把人脸识别作为进校、考勤的唯一方式", "why": "存在其他方式时不得作为唯一验证方式，且需提供替代方式", "clauses": ["face_10", "face_7"]},
    {"what": "用心理风险分给学生排名、分班、评优，或对学生和家长出示“风险倍数”", "why": "个体区分力有限（见下方 p3 结论），会给留守等身份贴标签",
     "clauses": ["pipl_24"]},
    {"what": "因为家长不同意非必要的数据处理，就不让学生使用基本功能", "why": "不得强制同意非必要处理，不得因此拒绝基本服务", "clauses": ["minor_32"]},
]

DEFAULTS = [
    {"name": "生物识别", "state": "默认关闭", "detail": "人脸、表情、眼动、声纹一律不采集；方法墙里的多模态内容只用合成信号演示。"},
    {"name": "心理信息分级可见", "state": "已开启", "detail": "个人只有“建议关注 / 普通”两档，只对班主任可见；校领导只看年级汇总；教育局不可见。"},
    {"name": "报告分级", "state": "已开启", "detail": "五类角色的报告粒度不同；汇总格子人数少于 10 时不显示。"},
    {"name": "不做个人排名", "state": "已开启", "detail": "所有名单按学号排列，不按分数或风险排序。"},
    {"name": "人工复核", "state": "已开启", "detail": "AI 评分低置信度或贴近档次边界时自动进入教师复核；家长看到的是复核后的结果。"},
    {"name": "云端 AI", "state": "默认关闭", "detail": "只有监护人单独勾选后才把作业发给云端大模型（p4 的设计）。"},
]
