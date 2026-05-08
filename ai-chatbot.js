/**
 * AI实验讲义 - 智能问答助手 v2.0
 * 支持多LLM后端（用户配置API key）、流式输出、会话管理
 * 无API时回退到增强本地知识库
 * 自包含组件，通过 <script src="ai-chatbot.js"></script> 引入
 */
(function() {
  'use strict';

  // ========== 配置 ==========
  var DEFAULT_SYSTEM_PROMPT = '你是AI实验讲义课程的智能助教。你的知识涵盖：Python编程、A*搜索算法、回归分析、线性判别分析(LDA)、AdaBoost集成学习、支持向量机(SVM)、决策树、K-means聚类、特征脸(Eigenface)、局部线性嵌入(LLE)、卷积神经网络(CNN)、循环神经网络(RNN/LSTM/GRU)。请用中文回答，用通俗易懂的语言解释概念，适当给出公式和代码示例。如果问题超出课程范围，诚实告知并建议查阅资料。回答尽量详实但不要过于啰嗦。';

  var PROVIDERS = {
    siliconflow: {
      name: '硅基流动 (免费)',
      endpoint: 'https://api.siliconflow.cn/v1/chat/completions',
      models: ['deepseek-ai/DeepSeek-V3', 'deepseek-ai/DeepSeek-R1', 'Qwen/Qwen2.5-7B-Instruct', 'Qwen/Qwen2.5-32B-Instruct', 'THUDM/glm-4-9b-chat'],
      defaultModel: 'deepseek-ai/DeepSeek-V3',
      authHeader: function(key) { return 'Bearer ' + key; },
      bodyBuilder: function(model, messages, stream) {
        return JSON.stringify({ model: model, messages: messages, stream: stream, max_tokens: 2048, temperature: 0.7 });
      }
    },
    openai: {
      name: 'OpenAI 兼容接口',
      endpoint: 'https://api.openai.com/v1/chat/completions',
      models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
      defaultModel: 'gpt-4o-mini',
      authHeader: function(key) { return 'Bearer ' + key; },
      bodyBuilder: function(model, messages, stream) {
        return JSON.stringify({ model: model, messages: messages, stream: stream, max_tokens: 2048, temperature: 0.7 });
      }
    },
    deepseek: {
      name: 'DeepSeek 官方',
      endpoint: 'https://api.deepseek.com/chat/completions',
      models: ['deepseek-chat', 'deepseek-reasoner'],
      defaultModel: 'deepseek-chat',
      authHeader: function(key) { return 'Bearer ' + key; },
      bodyBuilder: function(model, messages, stream) {
        return JSON.stringify({ model: model, messages: messages, stream: stream, max_tokens: 2048, temperature: 0.7 });
      }
    },
    gemini: {
      name: 'Google Gemini',
      endpoint: '', // Gemini uses different API, handled separately
      models: ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'],
      defaultModel: 'gemini-2.0-flash',
      authHeader: function(key) { return key; },
      bodyBuilder: null,
      special: true
    },
    custom: {
      name: '自定义兼容接口',
      endpoint: '',
      models: [],
      defaultModel: '',
      authHeader: function(key) { return 'Bearer ' + key; },
      bodyBuilder: function(model, messages, stream) {
        return JSON.stringify({ model: model, messages: messages, stream: stream, max_tokens: 2048, temperature: 0.7 });
      }
    }
  };

  // ========== 本地知识库（增强版） ==========
  var knowledgeBase = [
    { q: ['python', 'python基础', 'python是什么', 'python语言', '变量', '赋值', '数据类型', 'list', 'dict', '函数', 'def', '模块', 'import', 'pip', 'conda', 'numpy', 'pandas', 'matplotlib', '缩进'],
      a: 'Python是人工智能领域最常用的编程语言。\n\n**核心特点：**\n- 简洁易读的语法，强制缩进（4空格）\n- 变量无需声明类型，动态类型\n- 丰富的数据类型：int、float、str、list、dict、tuple、set\n- 用def定义函数，支持默认参数、*args、**kwargs\n- import导入模块，pip/conda管理包\n\n**AI常用库：**\n- NumPy：数值计算、矩阵运算\n- Pandas：数据处理和分析\n- Matplotlib/Seaborn：数据可视化\n- Scikit-learn：经典ML算法\n- PyTorch/TensorFlow：深度学习框架\n\n推荐使用Anaconda管理Python环境。' },

    { q: ['a*', 'a星', 'A*算法', '启发式搜索', '路径规划', '启发函数', '曼哈顿距离'],
      a: 'A*算法是最经典的启发式搜索算法。\n\n**核心公式：** f(n) = g(n) + h(n)\n- g(n)：起点到节点n的实际代价\n- h(n)：节点n到目标的估计代价（启发函数）\n\n**常用启发函数：**\n- 曼哈顿距离：适用于四方向网格\n- 欧几里得距离：直线距离\n- 切比雪夫距离：适用于八方向网格\n\n**关键性质：**\n- 当h(n)可采纳（不高估实际代价）时，保证找到最优解\n- h(n)越接近真实代价，搜索效率越高\n- 如果h(n)=0，退化为Dijkstra算法' },

    { q: ['回归', '线性回归', '多项式回归', 'regression', '过拟合', '欠拟合', '正则化', 'L1', 'L2', 'lasso', 'ridge'],
      a: '回归分析研究变量之间的关系，用于预测连续值。\n\n**线性回归：** y = β₀ + β₁x₁ + ... + βₙxₙ + ε\n- 最小二乘法：最小化残差平方和 RSS = Σ(yᵢ - ŷᵢ)²\n- R²决定系数衡量模型解释力，范围(-∞, 1]\n\n**正则化防止过拟合：**\n- L1（Lasso）：产生稀疏解，可做特征选择\n- L2（Ridge）：使参数平滑，防止过大系数\n- MSE/RMSE/MAE评估回归性能\n\n**多项式回归：** 通过特征的高次项拟合非线性关系，注意过拟合风险。' },

    { q: ['lda', '线性判别分析', 'LDA', '降维', '分类', 'pca', '主成分分析'],
      a: 'LDA是有监督的线性降维和分类方法。\n\n**核心思想：**\n- 寻找投影方向使类间散度最大、类内散度最小\n- Fisher准则：J(w) = (wᵀS_B w) / (wᵀS_W w)\n- 最多降到C-1维（C为类别数）\n\n**LDA vs PCA：**\n- PCA：无监督，最大化方差，不考虑类别\n- LDA：有监督，最大化类间分离度\n- PCA适合数据压缩，LDA适合分类任务\n\n**应用：** 人脸识别、模式分类、特征提取' },

    { q: ['adaboost', '集成学习', 'boosting', '弱学习器', 'bagging', '随机森林', 'ensemble'],
      a: 'AdaBoost是经典的集成学习Boosting算法。\n\n**核心思想：**\n1. 初始化所有样本权重相等\n2. 迭代训练弱分类器（如决策树桩）\n3. 增加错误分类样本的权重\n4. 最终分类器 = Σ αₜhₜ(x)，αₜ基于准确率\n\n**Boosting vs Bagging：**\n- Boosting：串行训练，关注错误样本\n- Bagging（随机森林）：并行训练，投票/平均\n- Boosting降低偏差，Bagging降低方差\n\n**关键：** 弱学习器准确率只需略好于随机猜测（>50%）' },

    { q: ['svm', '支持向量机', '核函数', '最大间隔', 'kernel', 'RBF', '核技巧', '支持向量'],
      a: 'SVM寻找最大间隔超平面进行分类。\n\n**核心概念：**\n- 支持向量：距离超平面最近的点\n- 最大间隔：最大化两类支持向量到超平面的距离\n- 软间隔：允许少量误分类（参数C控制）\n\n**核函数：** 将数据隐式映射到高维空间\n- 线性核：K(x,y)=x·y\n- RBF/高斯核：K(x,y)=exp(-γ||x-y||²)，最常用\n- 多项式核：K(x,y)=(x·y+c)^d\n- γ控制单个样本影响范围，C控制误分类惩罚\n\n**优势：** 小样本下表现好，泛化能力强' },

    { q: ['决策树', '信息增益', '基尼系数', '剪枝', 'cart', 'id3', 'c4.5', '信息熵', 'entropy'],
      a: '决策树通过树形结构进行决策，可解释性强。\n\n**分裂标准：**\n- 信息熵：H(D) = -Σp_k·log₂(p_k)\n- 信息增益（ID3）：Gain = H(D) - Σ|Dᵥ|/|D|·H(Dᵥ)\n- 信息增益比（C4.5）：解决信息增益偏向多值特征\n- 基尼系数（CART）：Gini = 1 - Σp_k²\n\n**防止过拟合：**\n- 预剪枝：限制深度、最小样本数\n- 后剪枝：先生成完整树再剪枝\n- max_depth=3~5是常用设置\n\n**优点：** 可解释、无需特征缩放、能处理混合类型' },

    { q: ['kmeans', 'k-means', '聚类', '无监督学习', '肘部法则', 'dbscan', '层次聚类'],
      a: 'K-means是最经典的无监督聚类算法。\n\n**算法步骤：**\n1. 随机初始化K个聚类中心\n2. 将每个点分配到最近的中心\n3. 重新计算聚类均值作为新中心\n4. 重复步骤2-3直到收敛\n\n**关键问题：**\n- 如何选择K？→ 肘部法则（观察SSE变化拐点）\n- 对初始中心敏感 → K-means++初始化\n- 可能陷入局部最优 → 多次运行取最好结果\n\n**其他聚类方法：** DBSCAN（基于密度）、层次聚类、高斯混合模型' },

    { q: ['特征脸', 'eigenface', '人脸识别', 'pca应用'],
      a: '特征脸方法将PCA应用于人脸识别。\n\n**步骤：**\n1. 将每张人脸图像展平为向量\n2. PCA提取主要特征向量（即"特征脸"）\n3. 每张人脸 = 平均脸 + 特征脸的线性组合\n4. 通过比较投影系数进行识别\n\n**优点：** 简单直观，降维效果好\n**缺点：** 对光照、姿态、表情敏感\n\n**改进方法：** Fisherface（LDA）、LBPH、深度学习' },

    { q: ['lle', '局部线性嵌入', '流形学习', '非线性降维', 't-SNE', 'isomap', 'umap'],
      a: 'LLE是非线性流形学习降维方法。\n\n**三步算法：**\n1. 近邻选择：为每个点找K个最近邻\n2. 权重计算：用近邻线性重构每个点，min Σ||xᵢ-Σwᵢⱼxⱼ||²\n3. 低维嵌入：保持权重不变，求低维表示\n\n**参数选择：**\n- K太小→流形撕裂；K太大→失去局部性\n- 推荐K=10~15\n\n**与其他方法对比：**\n- LLE：保持局部线性关系\n- t-SNE：保持概率分布，可视化好\n- UMAP：速度快，保持全局结构好\n- PCA：线性方法，LLE在非线性数据上更好' },

    { q: ['cnn', '卷积神经网络', '卷积', '池化', 'pooling', '迁移学习', 'transfer learning', 'resnet', 'vgg'],
      a: 'CNN是处理图像等网格结构数据的深度学习架构。\n\n**三大核心特性：**\n1. 局部感受野：每个神经元只连接局部区域\n2. 权值共享：同一卷积核在整张图上复用\n3. 池化降采样：减小尺寸，增强平移不变性\n\n**典型结构：** Conv→ReLU→Pool→...→FC→Softmax\n- 卷积层：提取局部特征\n- ReLU激活：f(x)=max(0,x)，缓解梯度消失\n- 池化层：最大池化/平均池化\n\n**经典架构：** LeNet→AlexNet→VGG→ResNet\n- ResNet的残差连接解决了深层网络的退化问题\n\n**迁移学习：** 使用ImageNet预训练模型在小数据集上微调' },

    { q: ['rnn', '循环神经网络', 'lstm', 'gru', '序列数据', '时间序列', '梯度消失', '梯度爆炸', 'nlp', 'transformer'],
      a: 'RNN用于处理序列数据，如文本、时间序列。\n\n**标准RNN问题：** 梯度消失/爆炸，无法学习长期依赖\n\n**LSTM（长短期记忆）：**\n- 遗忘门：决定丢弃哪些旧信息\n- 输入门：决定存储哪些新信息\n- 输出门：决定输出哪些信息\n- 细胞状态：传递长期信息\n\n**GRU（门控循环单元）：**\n- LSTM简化版，合并遗忘门和输入门为更新门\n- 参数更少，训练更快\n\n**发展趋势：** Transformer架构（自注意力机制）已逐渐取代RNN成为序列建模主流\n\n**应用：** NLP、时间序列预测、语音识别、机器翻译' },

    { q: ['深度学习', 'deep learning', '神经网络', '机器学习', 'machine learning', '损失函数', '激活函数', 'relu', 'sigmoid', '优化器', 'adam', 'sgd', 'dropout', '批归一化', 'batchnorm', 'gpu', 'cuda', 'pytorch', 'tensorflow'],
      a: '深度学习是机器学习的核心分支。\n\n**基本概念：**\n- 神经网络：多层非线性变换\n- 损失函数：MSE（回归）、交叉熵（分类）\n- 激活函数：ReLU最常用，Sigmoid/Softmax用于输出层\n- 优化器：Adam（自适应学习率，最常用）、SGD+Momentum\n\n**训练技巧：**\n- Dropout：随机丢弃神经元，防止过拟合\n- BatchNorm：稳定训练，允许更大学习率\n- 学习率调度：逐步减小学习率\n- 梯度裁剪：防止梯度爆炸\n\n**硬件：** GPU（NVIDIA+CUDA）大幅加速训练\n**框架：** PyTorch（学术首选）、TensorFlow（工业部署）' }
  ];

  // ========== 持久化存储 ==========
  function storage() {
    var key = 'ai-chatbot-config';
    return {
      get: function() {
        try { return JSON.parse(localStorage.getItem(key)) || {}; } catch(e) { return {}; }
      },
      set: function(obj) {
        try { localStorage.setItem(key, JSON.stringify(obj)); } catch(e) {}
      },
      getKey: function(k) {
        return this.get()[k];
      },
      setKey: function(k, v) {
        var cfg = this.get();
        cfg[k] = v;
        this.set(cfg);
      }
    };
  }
  var store = storage();

  // ========== UI ==========
  var CSS = [
    '#aic *, #aic :after, #aic :before { box-sizing:border-box; margin:0; padding:0 }',
    '#aic { position:fixed; bottom:20px; right:20px; z-index:99999; font-family:"Microsoft YaHei","Segoe UI",sans-serif; font-size:14px }',
    '#aic-btn { width:54px; height:54px; border-radius:50%; background:linear-gradient(135deg,#667eea,#764ba2); border:none; color:#fff; font-size:22px; cursor:pointer; box-shadow:0 4px 20px rgba(102,126,234,.4); transition:all .3s; display:flex; align-items:center; justify-content:center; position:relative }',
    '#aic-btn:hover { transform:scale(1.08); box-shadow:0 6px 28px rgba(102,126,234,.55) }',
    '#aic-btn .aic-dot { width:9px; height:9px; background:#4cff4c; border-radius:50%; position:absolute; top:5px; right:5px; animation:aic-pulse 2s infinite }',
    '@keyframes aic-pulse { 0%,to{opacity:1} 50%{opacity:.3} }',
    '#aic-win { display:none; position:absolute; bottom:70px; right:0; width:400px; height:540px; background:#fff; border-radius:16px; box-shadow:0 10px 40px rgba(0,0,0,.18); flex-direction:column; overflow:hidden; transition:opacity .25s }',
    '#aic-win.aic-open { display:flex }',
    '#aic-hdr { background:linear-gradient(135deg,#667eea,#764ba2); color:#fff; padding:12px 16px; display:flex; align-items:center; justify-content:space-between; flex-shrink:0 }',
    '#aic-hdr h3 { font-size:14px; font-weight:600; display:flex; align-items:center; gap:6px }',
    '#aic-hdr-btns { display:flex; gap:4px }',
    '#aic-hdr-btns button { background:none; border:none; color:#fff; font-size:16px; cursor:pointer; padding:4px 6px; border-radius:4px; transition:background .2s }',
    '#aic-hdr-btns button:hover { background:rgba(255,255,255,.2) }',
    '#aic-msgs { flex:1; overflow-y:auto; padding:14px; background:#f7f8fc }',
    '.aic-msg { margin-bottom:12px; display:flex; flex-direction:column }',
    '.aic-msg.user { align-items:flex-end }',
    '.aic-msg.bot { align-items:flex-start }',
    '.aic-msg .aic-bub { max-width:88%; padding:10px 14px; border-radius:16px; font-size:13px; line-height:1.6; word-wrap:break-word; white-space:pre-wrap }',
    '.aic-msg.user .aic-bub { background:linear-gradient(135deg,#667eea,#764ba2); color:#fff; border-bottom-right-radius:4px }',
    '.aic-msg.bot .aic-bub { background:#fff; color:#333; box-shadow:0 1px 6px rgba(0,0,0,.08); border-bottom-left-radius:4px }',
    '.aic-msg.bot .aic-bub p { margin:4px 0 }',
    '.aic-msg.bot .aic-bub strong { color:#667eea }',
    '.aic-msg.bot .aic-bub code { background:#f0f0f0; padding:1px 5px; border-radius:3px; font-size:12px }',
    '.aic-msg.bot .aic-bub pre { background:#2d3748; color:#e2e8f0; padding:10px; border-radius:6px; overflow-x:auto; margin:6px 0; font-size:12px }',
    '#aic-input-area { padding:10px 14px; background:#fff; border-top:1px solid #eee; display:flex; gap:8px; flex-shrink:0 }',
    '#aic-input { flex:1; padding:10px 14px; border:1px solid #ddd; border-radius:20px; font-size:13px; outline:none; transition:border-color .2s; resize:none; max-height:80px }',
    '#aic-input:focus { border-color:#667eea }',
    '#aic-send { width:38px; height:38px; border-radius:50%; background:linear-gradient(135deg,#667eea,#764ba2); border:none; color:#fff; font-size:15px; cursor:pointer; flex-shrink:0; transition:transform .2s; display:flex; align-items:center; justify-content:center }',
    '#aic-send:hover { transform:scale(1.08) }',
    '#aic-send:disabled { opacity:.5; cursor:default; transform:none }',
    '#aic-sugs { padding:8px 14px 12px; display:flex; flex-wrap:wrap; gap:6px; flex-shrink:0 }',
    '#aic-sugs .aic-chip { padding:5px 12px; background:#eef0ff; color:#667eea; border-radius:14px; font-size:11px; cursor:pointer; border:none; transition:background .2s; white-space:nowrap }',
    '#aic-sugs .aic-chip:hover { background:#dde0ff }',
    '#aic-status { padding:4px 14px; font-size:10px; color:#999; text-align:center; flex-shrink:0; background:#f7f8fc }',
    '#aic-status.online { color:#4caf50 }',
    '#aic-settings { display:none; position:absolute; top:0; left:0; width:100%; height:100%; background:#fff; z-index:10; flex-direction:column }',
    '#aic-settings.aic-open { display:flex }',
    '#aic-settings .aic-set-hdr { background:#f7f8fc; padding:12px 16px; border-bottom:1px solid #eee; display:flex; align-items:center; justify-content:space-between; flex-shrink:0 }',
    '#aic-settings .aic-set-body { flex:1; overflow-y:auto; padding:16px }',
    '#aic-settings label { display:block; font-size:12px; font-weight:600; color:#555; margin-bottom:4px; margin-top:12px }',
    '#aic-settings select, #aic-settings input { width:100%; padding:8px 10px; border:1px solid #ddd; border-radius:8px; font-size:13px; outline:none; margin-bottom:6px }',
    '#aic-settings select:focus, #aic-settings input:focus { border-color:#667eea }',
    '#aic-settings .aic-set-btn { padding:8px 16px; border-radius:8px; border:none; font-size:13px; cursor:pointer; transition:all .2s }',
    '#aic-settings .aic-set-btn.primary { background:linear-gradient(135deg,#667eea,#764ba2); color:#fff }',
    '#aic-settings .aic-set-btn.primary:hover { opacity:.9 }',
    '#aic-settings .aic-set-btn.secondary { background:#f0f0f0; color:#666 }',
    '#aic-settings .aic-set-btn.danger { background:#fff; color:#e74c3c; border:1px solid #e74c3c }',
    '#aic-settings .aic-set-hint { font-size:11px; color:#999; margin-top:4px; line-height:1.4 }',
    '#aic-settings .aic-set-hint a { color:#667eea }',
    '@media (max-width:440px) { #aic-win { width:calc(100vw - 40px); right:0 } }'
  ].join('');

  function injectStyles() {
    var style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  function buildHTML() {
    var container = document.createElement('div');
    container.id = 'aic';
    container.innerHTML = [
      '<div id="aic-win">',
        '<div id="aic-hdr">',
          '<h3>AI 学习助手</h3>',
          '<div id="aic-hdr-btns">',
            '<button id="aic-settings-btn" title="设置">&#9881;</button>',
            '<button id="aic-close" title="关闭">&times;</button>',
          '</div>',
        '</div>',
        '<div id="aic-settings">',
          '<div class="aic-set-hdr"><strong>API 设置</strong><button id="aic-settings-back" class="aic-set-btn secondary">← 返回</button></div>',
          '<div class="aic-set-body">',
            '<label>API 服务商</label>',
            '<select id="aic-provider"></select>',
            '<label>模型</label>',
            '<select id="aic-model"></select>',
            '<label>API Key</label>',
            '<input type="password" id="aic-apikey" placeholder="输入你的 API Key...">',
            '<div class="aic-set-hint" id="aic-key-hint"></div>',
            '<label>自定义 Endpoint（可选）</label>',
            '<input id="aic-endpoint" placeholder="https://api.example.com/v1/chat/completions">',
            '<div style="display:flex;gap:8px;margin-top:16px">',
              '<button id="aic-save-cfg" class="aic-set-btn primary">保存配置</button>',
              '<button id="aic-test-conn" class="aic-set-btn secondary">测试连接</button>',
            '</div>',
            '<div style="margin-top:12px">',
              '<button id="aic-clear-cfg" class="aic-set-btn danger">清除API配置（使用本地知识库）</button>',
            '</div>',
            '<div class="aic-set-hint" style="margin-top:12px"><strong>免费API获取：</strong><br>',
              '<a href="https://cloud.siliconflow.cn/" target="_blank">硅基流动</a> — 注册即送免费额度，支持DeepSeek/Qwen等模型<br>',
              '<a href="https://platform.deepseek.com/" target="_blank">DeepSeek</a> — 新用户有免费额度<br>',
              '<a href="https://aistudio.google.com/" target="_blank">Google AI Studio</a> — Gemini提供免费层',
            '</div>',
          '</div>',
        '</div>',
        '<div id="aic-msgs"></div>',
        '<div id="aic-status">本地知识库模式（配置API Key可接入大模型）</div>',
        '<div id="aic-sugs">',
          '<button class="aic-chip">CNN卷积原理</button>',
          '<button class="aic-chip">SVM核函数</button>',
          '<button class="aic-chip">K-means聚类步骤</button>',
          '<button class="aic-chip">决策树过拟合</button>',
          '<button class="aic-chip">LSTM原理</button>',
          '<button class="aic-chip">Python基础</button>',
        '</div>',
        '<div id="aic-input-area">',
          '<textarea id="aic-input" placeholder="输入问题..." autocomplete="off" rows="1"></textarea>',
          '<button id="aic-send">&#10148;</button>',
        '</div>',
      '</div>',
      '<button id="aic-btn"><span class="aic-dot"></span><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"></path></svg></button>'
    ].join('');
    document.body.appendChild(container);
    return container;
  }

  // ========== 本地知识库匹配 ==========
  function localSearch(question) {
    var q = question.toLowerCase().replace(/[？?！!。，,、\s]+/g, '').trim();
    if (q.length < 2) return null;

    // 精确关键词匹配
    var best = null, bestScore = 0;
    for (var i = 0; i < knowledgeBase.length; i++) {
      for (var j = 0; j < knowledgeBase[i].q.length; j++) {
        var kw = knowledgeBase[i].q[j].toLowerCase();
        if (q.indexOf(kw) !== -1) {
          var score = kw.length / Math.max(q.length, 1);
          if (score > bestScore) { bestScore = score; best = knowledgeBase[i]; }
        }
      }
    }
    if (best) return best.a;

    // 模糊匹配
    for (var i = 0; i < knowledgeBase.length; i++) {
      for (var j = 0; j < knowledgeBase[i].q.length; j++) {
        var kw = knowledgeBase[i].q[j].toLowerCase();
        if (kw.indexOf(q) !== -1 || q.indexOf(kw) !== -1) return knowledgeBase[i].a;
      }
    }
    return null;
  }

  function localFallback() {
    var tips = [
      '这是一个好问题！你可以尝试用更具体的AI/ML术语提问，例如：\n- "CNN的卷积层如何工作？"\n- "什么是梯度消失？如何解决？"\n- "K-means的K值如何选择？"\n\n或者点击下方快捷问题试试看。',
      '我目前运行在本地知识库模式，知识覆盖范围有限。\n\n你可以：\n1. 尝试换个方式提问\n2. 点击设置⚙️按钮，配置API Key接入大模型获得更全面的回答\n3. 查阅讲义对应章节获取详细信息',
      '建议你尝试以下关键词之一：Python、CNN、SVM、决策树、K-means、LSTM、回归分析、集成学习、LLE降维、特征脸。\n\n配置API Key后，我可以回答更广泛的问题。'
    ];
    return tips[Math.floor(Math.random() * tips.length)];
  }

  // ========== 大模型API调用 ==========
  function getConfig() {
    return {
      provider: store.getKey('provider') || '',
      model: store.getKey('model') || '',
      apikey: store.getKey('apikey') || '',
      endpoint: store.getKey('endpoint') || ''
    };
  }

  function hasApiConfig() {
    var cfg = getConfig();
    return !!(cfg.provider && cfg.apikey);
  }

  function buildMessages(userMsg, history) {
    var msgs = [{ role: 'system', content: DEFAULT_SYSTEM_PROMPT }];
    if (history && history.length) {
      for (var i = 0; i < Math.min(history.length, 20); i++) {
        msgs.push(history[i]);
      }
    }
    msgs.push({ role: 'user', content: userMsg });
    return msgs;
  }

  function callLLM(userMsg, history, onChunk, onDone, onError) {
    var cfg = getConfig();
    var provider = PROVIDERS[cfg.provider];
    if (!provider) { onError('未配置API服务商'); return; }

    var endpoint = cfg.endpoint || provider.endpoint;
    if (!endpoint) { onError('未配置Endpoint'); return; }

    var model = cfg.model || provider.defaultModel;
    var messages = buildMessages(userMsg, history);

    if (provider.special && cfg.provider === 'gemini') {
      callGemini(model, cfg.apikey, messages, onChunk, onDone, onError);
      return;
    }

    var body = provider.bodyBuilder(model, messages, true);
    fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': provider.authHeader(cfg.apikey)
      },
      body: body
    }).then(function(resp) {
      if (!resp.ok) {
        return resp.json().then(function(e) {
          throw new Error('API错误 ' + resp.status + ': ' + (e.error?.message || JSON.stringify(e)));
        }).catch(function(e) { throw e; });
      }
      return readSSE(resp, onChunk, onDone, onError);
    }).catch(function(e) {
      onError(e.message || '网络请求失败');
    });
  }

  function callGemini(model, key, messages, onChunk, onDone, onError) {
    // Convert to Gemini format
    var systemPrompt = '';
    var contents = [];
    for (var i = 0; i < messages.length; i++) {
      if (messages[i].role === 'system') {
        systemPrompt = messages[i].content;
      } else {
        contents.push({
          role: messages[i].role === 'assistant' ? 'model' : 'user',
          parts: [{ text: messages[i].content }]
        });
      }
    }
    var fullModel = 'models/' + (model || 'gemini-2.0-flash');
    var url = 'https://generativelanguage.googleapis.com/v1beta/' + fullModel + ':streamGenerateContent?alt=sse&key=' + key;
    var body = JSON.stringify({
      contents: contents,
      systemInstruction: systemPrompt ? { parts: [{ text: systemPrompt }] } : undefined,
      generationConfig: { temperature: 0.7, maxOutputTokens: 2048 }
    });

    fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body })
      .then(function(resp) {
        if (!resp.ok) return resp.json().then(function(e) { throw new Error('Gemini错误: ' + JSON.stringify(e.error)); });
        return readSSE(resp, onChunk, onDone, onError);
      })
      .catch(function(e) { onError(e.message); });
  }

  function readSSE(response, onChunk, onDone, onError) {
    var reader = response.body.getReader();
    var decoder = new TextDecoder();
    var buffer = '';
    var fullText = '';

    function pump() {
      reader.read().then(function(result) {
        if (result.done) {
          onDone(fullText);
          return;
        }
        buffer += decoder.decode(result.value, { stream: true });
        var lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (var i = 0; i < lines.length; i++) {
          var line = lines[i].trim();
          if (!line || !line.startsWith('data:')) continue;
          var data = line.substring(5).trim();
          if (data === '[DONE]') continue;

          try {
            var json = JSON.parse(data);
            var content = '';
            // OpenAI-compatible format
            if (json.choices && json.choices[0] && json.choices[0].delta && json.choices[0].delta.content) {
              content = json.choices[0].delta.content;
            }
            // Gemini format
            if (json.candidates && json.candidates[0] && json.candidates[0].content && json.candidates[0].content.parts) {
              content = json.candidates[0].content.parts[0].text || '';
            }
            if (content) {
              fullText += content;
              onChunk(content);
            }
          } catch(e) {}
        }
        pump();
      }).catch(function(e) {
        // 如果已经有部分内容，算成功
        if (fullText) { onDone(fullText); }
        else { onError('读取响应流失败: ' + (e.message || '')); }
      });
    }
    pump();
  }

  // ========== 主逻辑 ==========
  function initChatbot() {
    injectStyles();
    var container = buildHTML();

    var win = document.getElementById('aic-win');
    var btn = document.getElementById('aic-btn');
    var closeBtn = document.getElementById('aic-close');
    var input = document.getElementById('aic-input');
    var sendBtn = document.getElementById('aic-send');
    var msgsEl = document.getElementById('aic-msgs');
    var sugsEl = document.getElementById('aic-sugs');
    var statusEl = document.getElementById('aic-status');
    var settingsEl = document.getElementById('aic-settings');
    var settingsBtn = document.getElementById('aic-settings-btn');
    var settingsBack = document.getElementById('aic-settings-back');
    var providerSel = document.getElementById('aic-provider');
    var modelSel = document.getElementById('aic-model');
    var apikeyInput = document.getElementById('aic-apikey');
    var endpointInput = document.getElementById('aic-endpoint');
    var keyHint = document.getElementById('aic-key-hint');
    var saveCfgBtn = document.getElementById('aic-save-cfg');
    var testConnBtn = document.getElementById('aic-test-conn');
    var clearCfgBtn = document.getElementById('aic-clear-cfg');

    var conversationHistory = [];
    var isGenerating = false;

    // ===== UI交互 =====
    function toggleWin() {
      if (win.classList.contains('aic-open')) {
        win.classList.remove('aic-open');
        settingsEl.classList.remove('aic-open');
      } else {
        win.classList.add('aic-open');
        input.focus();
      }
    }

    btn.addEventListener('click', toggleWin);
    closeBtn.addEventListener('click', function() { win.classList.remove('aic-open'); });

    settingsBtn.addEventListener('click', function() {
      settingsEl.classList.add('aic-open');
      populateSettings();
    });
    settingsBack.addEventListener('click', function() {
      settingsEl.classList.remove('aic-open');
    });

    // ===== 消息渲染 =====
    function addMsg(text, role) {
      var div = document.createElement('div');
      div.className = 'aic-msg ' + role;
      var bubble = document.createElement('div');
      bubble.className = 'aic-bub';
      if (role === 'bot') {
        bubble.innerHTML = formatMarkdown(text);
      } else {
        bubble.textContent = text;
      }
      div.appendChild(bubble);
      msgsEl.appendChild(div);
      msgsEl.scrollTop = msgsEl.scrollHeight;
      return bubble;
    }

    function formatMarkdown(text) {
      // 简单的Markdown渲染
      var html = text
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\n/g, '<br>');
      // 处理代码块
      html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, function(m, lang, code) {
        return '<pre>' + code.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</pre>';
      });
      return html;
    }

    function addTyping() {
      var div = document.createElement('div');
      div.className = 'aic-msg bot';
      div.id = 'aic-typing';
      div.innerHTML = '<div class="aic-bub" style="padding:8px 14px"><span style="display:inline-block;width:6px;height:6px;background:#aaa;border-radius:50%;margin:0 2px;animation:aic-dotb 1.4s infinite"></span><span style="display:inline-block;width:6px;height:6px;background:#aaa;border-radius:50%;margin:0 2px;animation:aic-dotb 1.4s .2s infinite"></span><span style="display:inline-block;width:6px;height:6px;background:#aaa;border-radius:50%;margin:0 2px;animation:aic-dotb 1.4s .4s infinite"></span></div>';
      msgsEl.appendChild(div);
      msgsEl.scrollTop = msgsEl.scrollHeight;
    }

    function removeTyping() {
      var el = document.getElementById('aic-typing');
      if (el) el.remove();
    }

    // 添加动画样式
    var animStyle = document.createElement('style');
    animStyle.textContent = '@keyframes aic-dotb{0%,60%,100%{transform:translateY(0);opacity:.4}30%{transform:translateY(-5px);opacity:1}}';
    document.head.appendChild(animStyle);

    // ===== 消息处理 =====
    function handleQuery(text) {
      if (!text.trim() || isGenerating) return;
      isGenerating = true;
      sendBtn.disabled = true;

      addMsg(text, 'user');
      input.value = '';
      input.style.height = 'auto';
      addTyping();

      if (hasApiConfig()) {
        // 使用LLM API
        statusEl.textContent = 'AI 思考中...';
        statusEl.className = '';

        var bubble = null;
        var fullResponse = '';
        var resolved = false;

        callLLM(text, conversationHistory,
          function(chunk) {
            // onChunk
            if (!resolved) {
              removeTyping();
              bubble = addMsg('', 'bot');
              resolved = true;
            }
            fullResponse += chunk;
            bubble.innerHTML = formatMarkdown(fullResponse);
            msgsEl.scrollTop = msgsEl.scrollHeight;
          },
          function(full) {
            // onDone
            if (!resolved && full) {
              removeTyping();
              addMsg(full, 'bot');
            } else if (!resolved) {
              removeTyping();
              addMsg('（模型未返回内容）', 'bot');
            }
            conversationHistory.push({ role: 'user', content: text });
            conversationHistory.push({ role: 'assistant', content: full || fullResponse });
            if (conversationHistory.length > 30) conversationHistory = conversationHistory.slice(-30);
            isGenerating = false;
            sendBtn.disabled = false;
            updateStatus();
            input.focus();
          },
          function(err) {
            // onError
            removeTyping();
            addMsg('调用API失败: ' + err + '\n\n已回退到本地知识库模式。请检查API配置。', 'bot');
            isGenerating = false;
            sendBtn.disabled = false;
            updateStatus();
            input.focus();

            // 回退到本地知识库
            var local = localSearch(text);
            if (local) {
              setTimeout(function() { addMsg(local, 'bot'); }, 500);
            }
          }
        );
      } else {
        // 使用本地知识库
        setTimeout(function() {
          removeTyping();
          var answer = localSearch(text);
          if (!answer) answer = localFallback();
          addMsg(answer, 'bot');
          isGenerating = false;
          sendBtn.disabled = false;
          input.focus();
        }, 600 + Math.random() * 800);
      }
    }

    // ===== 发送按钮 =====
    sendBtn.addEventListener('click', function() { handleQuery(input.value); });
    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleQuery(input.value);
      }
    });
    // 自动调整textarea高度
    input.addEventListener('input', function() {
      this.style.height = 'auto';
      this.style.height = Math.min(this.scrollHeight, 80) + 'px';
    });

    // ===== 建议问题 =====
    sugsEl.addEventListener('click', function(e) {
      if (e.target.classList.contains('aic-chip')) {
        handleQuery(e.target.textContent);
      }
    });

    // ===== 设置面板 =====
    function populateSettings() {
      // 填充provider列表
      var keys = Object.keys(PROVIDERS);
      providerSel.innerHTML = '<option value="">-- 选择服务商 --</option>';
      for (var i = 0; i < keys.length; i++) {
        var p = PROVIDERS[keys[i]];
        var sel = store.getKey('provider') === keys[i] ? ' selected' : '';
        providerSel.innerHTML += '<option value="' + keys[i] + '"' + sel + '>' + p.name + '</option>';
      }

      // 填充当前配置
      var cfg = getConfig();
      if (cfg.apikey) apikeyInput.value = cfg.apikey;
      if (cfg.endpoint) endpointInput.value = cfg.endpoint;
      if (cfg.provider) updateModelList(cfg.provider, cfg.model);

      updateKeyHint();
    }

    function updateModelList(providerKey, currentModel) {
      modelSel.innerHTML = '';
      var p = PROVIDERS[providerKey];
      if (!p || !p.models) return;
      for (var i = 0; i < p.models.length; i++) {
        var m = p.models[i];
        var sel = (currentModel === m || (!currentModel && m === p.defaultModel)) ? ' selected' : '';
        modelSel.innerHTML += '<option value="' + m + '"' + sel + '>' + m + '</option>';
      }
    }

    function updateKeyHint() {
      var provider = providerSel.value;
      var hints = {
        'siliconflow': '在 <a href="https://cloud.siliconflow.cn/account/ak" target="_blank">硅基流动控制台</a> 获取API Key，新用户赠送免费额度。',
        'openai': '在 <a href="https://platform.openai.com/api-keys" target="_blank">OpenAI控制台</a> 获取API Key。',
        'deepseek': '在 <a href="https://platform.deepseek.com/api_keys" target="_blank">DeepSeek控制台</a> 获取API Key。',
        'gemini': '在 <a href="https://aistudio.google.com/app/apikey" target="_blank">Google AI Studio</a> 获取API Key（免费）。',
        'custom': '输入与你API兼容的完整endpoint地址和API Key。'
      };
      keyHint.innerHTML = hints[provider] || '';
    }

    providerSel.addEventListener('change', function() {
      updateModelList(this.value, '');
      updateKeyHint();
      var p = PROVIDERS[this.value];
      if (p && p.endpoint) {
        endpointInput.value = p.endpoint;
        endpointInput.placeholder = p.endpoint;
      }
    });

    saveCfgBtn.addEventListener('click', function() {
      var provider = providerSel.value;
      var model = modelSel.value;
      var apikey = apikeyInput.value.trim();
      var endpoint = endpointInput.value.trim();

      if (!provider) { alert('请选择API服务商'); return; }
      if (!apikey) { alert('请输入API Key'); return; }

      store.setKey('provider', provider);
      store.setKey('model', model);
      store.setKey('apikey', apikey);
      store.setKey('endpoint', endpoint);

      alert('配置已保存！');
      settingsEl.classList.remove('aic-open');
      conversationHistory = []; // 清除历史
      updateStatus();
    });

    testConnBtn.addEventListener('click', function() {
      var provider = providerSel.value;
      var apikey = apikeyInput.value.trim();
      if (!provider || !apikey) { alert('请先选择服务商并输入API Key'); return; }

      // 临时覆盖配置进行测试
      var origCfg = getConfig();
      store.setKey('provider', provider);
      store.setKey('apikey', apikey);
      store.setKey('model', modelSel.value);
      store.setKey('endpoint', endpointInput.value.trim());

      testConnBtn.textContent = '测试中...';
      testConnBtn.disabled = true;

      callLLM('你好，请回复"连接成功"', [], function() {}, function(resp) {
        alert('连接成功！模型可用。');
        testConnBtn.textContent = '测试连接';
        testConnBtn.disabled = false;
        // 恢复原配置
        store.setKey('provider', origCfg.provider || '');
        store.setKey('apikey', origCfg.apikey || '');
        store.setKey('model', origCfg.model || '');
        store.setKey('endpoint', origCfg.endpoint || '');
      }, function(err) {
        alert('连接失败: ' + err);
        testConnBtn.textContent = '测试连接';
        testConnBtn.disabled = false;
        // 恢复原配置
        store.setKey('provider', origCfg.provider || '');
        store.setKey('apikey', origCfg.apikey || '');
        store.setKey('model', origCfg.model || '');
        store.setKey('endpoint', origCfg.endpoint || '');
      });
    });

    clearCfgBtn.addEventListener('click', function() {
      if (confirm('确定要清除API配置吗？将使用本地知识库回答问题。')) {
        store.setKey('provider', '');
        store.setKey('model', '');
        store.setKey('apikey', '');
        store.setKey('endpoint', '');
        apikeyInput.value = '';
        endpointInput.value = '';
        conversationHistory = [];
        updateStatus();
        alert('API配置已清除，当前使用本地知识库。');
      }
    });

    function updateStatus() {
      if (hasApiConfig()) {
        var p = PROVIDERS[getConfig().provider];
        statusEl.textContent = '在线: ' + (p ? p.name : '') + ' | ' + (getConfig().model || '');
        statusEl.className = 'online';
      } else {
        statusEl.textContent = '本地知识库模式（配置API Key可接入大模型）';
        statusEl.className = '';
      }
    }

    // ===== 初始化 =====
    updateStatus();
    populateSettings();

    // 欢迎消息
    if (hasApiConfig()) {
      setTimeout(function() {
        // 不自动发欢迎消息，避免浪费API额度
      }, 100);
    }
  }

  // ========== 启动 ==========
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initChatbot);
  } else {
    initChatbot();
  }

  // ========== 学习进度追踪系统 ==========
  function initProgressTracker() {
    var STORAGE_KEY = 'ai_course_progress';
    var pageTitle = document.title.replace(/\s*[-|].*$/, '').replace(/^人工智能课程实验(讲义)?[：:]\s*/, '').trim();
    var pagePath = window.location.pathname;

    // 读取或初始化进度数据
    var progress = {};
    try {
      progress = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    } catch(e) { progress = {}; }

    // 记录当前页面访问
    var pageKey = pagePath.split('/').pop() || 'index';
    // 注意: index.html 在根目录，chapter pages 在子目录
    var chapterMatch = pagePath.match(/(\d+)\s*第\w+章/);
    var chapterNum = chapterMatch ? parseInt(chapterMatch[1]) : null;

    if (!progress.pages) progress.pages = {};
    if (!progress.pages[pageKey]) {
      progress.pages[pageKey] = { title: pageTitle, firstVisit: Date.now(), visits: 0, chapter: chapterNum };
    }
    progress.pages[pageKey].visits++;
    progress.pages[pageKey].lastVisit = Date.now();
    progress.pages[pageKey].title = pageTitle;

    // 统计已访问章节数
    var visitedChapters = {};
    for (var k in progress.pages) {
      var p = progress.pages[k];
      if (p.chapter) visitedChapters[p.chapter] = true;
    }
    var totalVisited = Object.keys(visitedChapters).length;
    progress.totalChapters = 12;
    progress.visitedCount = totalVisited;

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
    } catch(e) {}

    // 创建浮动进度指示器
    var indicator = document.createElement('div');
    indicator.id = 'aic-progress-indicator';
    indicator.style.cssText = 'position:fixed;top:80px;right:20px;z-index:999;background:rgba(255,255,255,0.95);border-radius:12px;padding:10px 14px;box-shadow:0 4px 20px rgba(0,0,0,0.12);font-size:13px;display:flex;align-items:center;gap:8px;transition:all 0.3s ease;cursor:pointer;backdrop-filter:blur(10px);';
    indicator.title = '点击查看学习进度详情';
    indicator.innerHTML = '<span style="font-size:18px;">📊</span><span><strong style="color:#667eea;">' + totalVisited + '</strong>/12 章已学</span>';
    indicator.addEventListener('click', function() {
      showProgressDetail(progress);
    });
    document.body.appendChild(indicator);

    // 鼠标悬停效果
    indicator.addEventListener('mouseenter', function() {
      this.style.transform = 'scale(1.05)';
      this.style.boxShadow = '0 6px 25px rgba(102,126,234,0.3)';
    });
    indicator.addEventListener('mouseleave', function() {
      this.style.transform = 'scale(1)';
      this.style.boxShadow = '0 4px 20px rgba(0,0,0,0.12)';
    });
  }

  function showProgressDetail(progress) {
    // 移除已存在的弹窗
    var existing = document.getElementById('aic-progress-modal');
    if (existing) existing.remove();

    var chapters = {
      0: 'Python编程基础', 1: 'A*搜索算法', 2: '回归分析', 3: '线性判别分析(LDA)',
      4: 'AdaBoost集成学习', 5: '支持向量机(SVM)', 6: '决策树', 7: 'K-means聚类',
      8: '特征脸(Eigenface)', 9: '局部线性嵌入(LLE)', 10: '卷积神经网络(CNN)',
      11: '循环神经网络(RNN)', 12: '主页面'
    };

    var visitedMap = {};
    for (var k in progress.pages) {
      var p = progress.pages[k];
      if (p.chapter !== null && p.chapter !== undefined) visitedMap[p.chapter] = true;
    }
    // 主页面也算
    if (progress.pages['index.html'] || progress.pages['index']) visitedMap[12] = true;

    var listHtml = '';
    for (var ch = 0; ch <= 12; ch++) {
      var visited = !!(visitedMap[ch] || (ch === 12 && progress.visitedCount >= 1));
      var icon = visited ? '✅' : '⬜';
      var name = chapters[ch] || '第' + ch + '章';
      if (ch === 12) name = '主页面 (index)';
      else if (ch > 0) name = '第' + ch + '章: ' + name;
      else name = '第0章基础: ' + name;
      listHtml += '<div style="padding:6px 0;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;"><span>' + icon + ' ' + name + '</span><span style="color:' + (visited ? '#27ae60' : '#ccc') + ';font-size:12px;">' + (visited ? '已学' : '未学') + '</span></div>';
    }

    var modal = document.createElement('div');
    modal.id = 'aic-progress-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:10001;display:flex;justify-content:center;align-items:center;';
    modal.innerHTML = '<div style="background:white;border-radius:16px;padding:24px;max-width:420px;max-height:80vh;overflow-y:auto;box-shadow:0 8px 40px rgba(0,0,0,0.2);"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;"><h3 style="margin:0;font-size:18px;">📊 学习进度</h3><button style="background:#f0f0f0;border:none;border-radius:50%;width:32px;height:32px;cursor:pointer;font-size:16px;">✕</button></div><div style="margin-bottom:8px;font-size:14px;color:#666;">进度: <strong style="color:#667eea;">' + progress.visitedCount + '</strong>/12 章节 (主页面不计)</div>' + listHtml + '<div style="margin-top:12px;padding-top:8px;border-top:2px solid #f0f0f0;font-size:12px;color:#999;">数据保存在浏览器本地。清除浏览器数据会重置进度。</div></div>';
    document.body.appendChild(modal);

    modal.querySelector('button').addEventListener('click', function() { modal.remove(); });
    modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
  }

  // ========== 回到顶部按钮 ==========
  function initBackToTop() {
    var btn = document.createElement('button');
    btn.id = 'aic-back-to-top';
    btn.innerHTML = '↑';
    btn.title = '回到顶部';
    btn.style.cssText = 'position:fixed;bottom:100px;right:26px;z-index:998;width:44px;height:44px;background:#667eea;color:#fff;border:none;border-radius:50%;font-size:22px;cursor:pointer;box-shadow:0 4px 15px rgba(102,126,234,0.4);transition:all 0.3s ease;opacity:0;visibility:hidden;transform:translateY(10px);';
    btn.addEventListener('click', function() {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    btn.addEventListener('mouseenter', function() {
      this.style.background = '#764ba2';
      this.style.transform = 'translateY(-2px)';
      this.style.boxShadow = '0 6px 20px rgba(118,75,162,0.5)';
    });
    btn.addEventListener('mouseleave', function() {
      this.style.background = '#667eea';
      this.style.transform = 'translateY(0)';
      this.style.boxShadow = '0 4px 15px rgba(102,126,234,0.4)';
    });
    document.body.appendChild(btn);

    var ticking = false;
    window.addEventListener('scroll', function() {
      if (!ticking) {
        requestAnimationFrame(function() {
          if (window.scrollY > 400) {
            btn.style.opacity = '1';
            btn.style.visibility = 'visible';
            btn.style.transform = 'translateY(0)';
          } else {
            btn.style.opacity = '0';
            btn.style.visibility = 'hidden';
            btn.style.transform = 'translateY(10px)';
          }
          ticking = false;
        });
        ticking = true;
      }
    });
  }

  // ========== 阅读时间估算 ==========
  function initReadingTime() {
    var text = document.body.textContent || '';
    // 统计中文字符数（中文字符、日文、韩文）
    var chineseChars = (text.match(/[一-鿿㐀-䶿]/g) || []).length;
    // 中文阅读速度约400字/分钟
    var minutes = Math.max(1, Math.round(chineseChars / 400));

    // 查找合适的插入位置：导航栏、header区域
    var targetEl = document.querySelector('.hero-section') || document.querySelector('.header') || document.querySelector('header') || document.querySelector('h1') || document.body.firstElementChild;
    if (targetEl) {
      var badge = document.createElement('span');
      badge.style.cssText = 'display:inline-block;background:rgba(255,255,255,0.2);color:inherit;padding:4px 12px;border-radius:20px;font-size:13px;margin-left:12px;vertical-align:middle;opacity:0.85;';
      badge.innerHTML = '⏱ 预计阅读 ' + minutes + ' 分钟';
      // 插入到h1的后面
      var h1 = targetEl.querySelector('h1');
      if (h1) {
        h1.appendChild(badge);
      }
    }
  }

  // 页面加载完成后初始化辅助功能
  function initHelpers() {
    initProgressTracker();
    initBackToTop();
    setTimeout(initReadingTime, 100);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHelpers);
  } else {
    initHelpers();
  }
})();
