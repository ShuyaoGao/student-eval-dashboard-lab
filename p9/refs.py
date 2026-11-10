"""论文出处清单。

每条只写“用来核实的标识”（DOI / arXiv / Semantic Scholar 标识）和我们期望的标题；
作者、年份、发表处一律以 tools/verify_refs.py 从 Crossref / arXiv / Semantic Scholar 取回的元数据为准，
结果存进 data/refs_verified.json，页面只显示核实过的字段。核实不了的条目在页面上标 [未核实]。
"""
from __future__ import annotations

REFS: list[dict] = [
    # ---- 知识追踪 ----
    {"key": "bkt", "title": "Knowledge tracing: Modeling the acquisition of procedural knowledge",
     "doi": "10.1007/BF01099821"},
    {"key": "dkt", "title": "Deep Knowledge Tracing", "arxiv": "1506.05908", "s2": "arXiv:1506.05908"},
    {"key": "sakt", "title": "A Self-Attentive model for Knowledge Tracing", "arxiv": "1907.06837", "s2": "arXiv:1907.06837"},
    {"key": "akt", "title": "Context-Aware Attentive Knowledge Tracing", "doi": "10.1145/3394486.3403282",
     "arxiv": "2007.12324"},
    {"key": "pfa", "title": "Performance Factors Analysis - A New Alternative to Knowledge Tracing",
     "doi": "10.3233/978-1-60750-028-5-531", "s2": "DOI:10.3233/978-1-60750-028-5-531"},
    # ---- 认知诊断 ----
    {"key": "dina_junker", "title": "Cognitive Assessment Models with Few Assumptions, and Connections with Nonparametric Item Response Theory",
     "doi": "10.1177/01466210122032064"},
    {"key": "dina_delatorre", "title": "DINA Model and Parameter Estimation: A Didactic",
     "doi": "10.3102/1076998607309474"},
    {"key": "neuralcd", "title": "Neural Cognitive Diagnosis for Intelligent Education Systems",
     "doi": "10.1609/aaai.v34i04.6080", "arxiv": "1908.08733"},
    # ---- IRT / CAT ----
    {"key": "bock_aitkin", "title": "Marginal maximum likelihood estimation of item parameters: Application of an EM algorithm",
     "doi": "10.1007/BF02293801"},
    {"key": "bock_mislevy", "title": "Adaptive EAP Estimation of Ability in a Microcomputer Environment",
     "doi": "10.1177/014662168200600405"},
    {"key": "weiss_kingsbury", "title": "Application of computerized adaptive testing to educational problems",
     "doi": "10.1111/j.1745-3984.1984.tb01040.x"},
    # ---- 大模型评阅 / 教育大模型 ----
    {"key": "mizumoto", "title": "Exploring the potential of using an AI language model for automated essay scoring",
     "doi": "10.1016/j.rmal.2023.100050"},
    {"key": "kasneci", "title": "ChatGPT for good? On opportunities and challenges of large language models for education",
     "doi": "10.1016/j.lindif.2023.102274"},
    {"key": "ellipse", "title": "The English Language Learner Insight, Proficiency and Skills Evaluation (ELLIPSE) Corpus",
     "doi": "10.1075/ijlcr.22026.cro"},
    # ---- 多模态学习分析（概念演示） ----
    {"key": "mmla_ochoa", "title": "Augmenting Learning Analytics with Multimodal Sensory Data",
     "doi": "10.18608/jla.2016.32.10"},
    {"key": "engagement_dmello", "title": "Advanced, Analytic, Automated (AAA) Measurement of Engagement During Learning",
     "doi": "10.1080/00461520.2017.1281747"},
    {"key": "daisee", "title": "DAiSEE: Towards User Engagement Recognition in the Wild", "arxiv": "1609.01885"},
    {"key": "barrett_emotion", "title": "Emotional Expressions Reconsidered: Challenges to Inferring Emotion From Human Facial Movements",
     "doi": "10.1177/1529100619832930"},
    {"key": "eyetracking_review", "title": "A systematic review of eye tracking research on multimedia learning",
     "doi": "10.1016/j.compedu.2018.06.023"},
    {"key": "teacher_discourse", "title": "Toward Automated Feedback on Teacher Discourse to Enhance Teacher Learning",
     "doi": "10.1145/3313831.3376418"},
    # ---- 公平性 ----
    {"key": "baker_bias", "title": "Algorithmic Bias in Education", "doi": "10.1007/s40593-021-00285-9"},
]
