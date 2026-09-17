function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function fill(tpl, vars) {
  return tpl.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? "");
}

function value(input, fallbackText) {
  const v = String(input ?? "").trim();
  return v || fallbackText;
}

function customerVars(context, cond) {
  const c = { ...context?.customer?.data, ...context?.customer };
  return {
    name: value(c.title, "本地商家"),
    industry: value(c.industry, "本地商家"),
    city: value(c.city, "同城"),
    products: value(c.products, "主打产品与服务"),
    targets: value(c.target_customers, "同城有需要的顾客"),
    advantages: value(c.advantages, "【待补充：可验证的优势】"),
    audience: value(cond.audience, c.target_customers || "同城有需要的顾客"),
  };
}

function internalVars(cond) {
  return {
    name: "我们团队",
    industry: "同城短视频运营",
    city: "同城",
    products: "短视频代运营与培训",
    targets: "想做同城流量的商家",
    advantages: "实战、落地、可复制",
    audience: value(cond.audience, "同城商家与学员"),
  };
}

const CUSTOMER_HOOKS = {
  同城流量: [
    "【{city}】{targets}注意了，{name}今天把话说明白。",
    "住在{name}附近的朋友，这条视频建议看到最后。",
    "{city}人别错过，{industry}原来可以这样选。",
  ],
  老板人设: [
    "我是{name}的老板，今天说句同行不爱听的大实话。",
    "在{city}做{industry}这些年，我最怕听到这句话。",
    "老板亲自出镜：为什么我不怕把价格说透。",
  ],
  专业知识: [
    "{industry}这行，3个内行才懂的门道，今天免费讲给你。",
    "选{industry}别踩坑，记住这几点就够了。",
    "一个{industry}从业者的经验：这几点很少有人告诉你。",
  ],
  产品: [
    "很多人问{name}家的{products}到底怎么样，今天一次讲清楚。",
    "选择{products}之前，先问清楚这几个问题。",
    "{products}值不值？我用真实情况回答你。",
  ],
  案例: [
    "{targets}遇到的问题，适合用什么案例讲清楚？",
    "用一个经过授权的案例，讲清{name}的服务过程。",
    "案例怎么判断？先看需求，再看过程和结果。",
  ],
  成交: [
    "{city}的{targets}，选择{name}前可以了解这些信息。",
    "还在犹豫是否适合自己？先把这个问题问清楚。",
    "成交不是靠催，{name}靠的是这几点。",
  ],
  争议: [
    "有人说{industry}都是套路？我不同意，今天正面回应。",
    "关于{industry}的不同看法，今天把判断依据讲清楚。",
    "{industry}争议不少，但有件事必须讲明白。",
  ],
};

const CUSTOMER_BODIES = {
  同城流量: [
    "很多人不知道，{industry}其实有不少门道。{name}做了这么久，最想告诉{targets}的是：{advantages}。别盲目跟风，先看看真实情况再决定。",
    "{city}本地人最关心的就是靠谱。{name}一直坚持{advantages}，具体如何做到，请看接下来的现场演示。",
    "如果你也关心{products}，这条内容值得看完。{name}把真实情况和盘托出，帮{targets}少走弯路。",
  ],
  老板人设: [
    "做这行久了，越来越明白一个道理：{targets}要的不是花哨，而是实在。{name}的{advantages}，就是把每个细节都当回事。",
    "我作为老板，愿意把{products}和服务过程讲给你听。{name}不吹牛，只讲做过的事。",
    "信任是慢慢攒出来的。{name}在{city}这些年，靠的是{advantages}，接下来用实际服务细节说明。",
  ],
  专业知识: [
    "第一看{products}，第二看服务流程，第三看{advantages}。{name}把这些都摊开讲，{targets}一看就懂。",
    "内行看门道：{industry}最容易忽视的细节，恰恰决定体验。{name}愿意把这些经验分享出来。",
    "专业知识不该藏着。{name}用大白话讲清楚{industry}的门道，帮{targets}做出判断。",
  ],
  产品: [
    "{products}主打{advantages}，适合{targets}。不用只听别人说，来{name}现场看一看、试一次就知道。",
    "一款产品好不好，要讲清楚它解决了什么。{name}的{products}，就是围绕{targets}的真实需求来做。",
    "我们不怕对比。{name}的{products}和{advantages}，欢迎{targets}带着问题来验证。",
  ],
  案例: [
    "【待补充：已获授权的顾客需求】。结合{advantages}，展示实际处理过程：【待补充：过程和结果证据】。",
    "复盘这个案例，关键不是运气，而是{advantages}。{name}把过程讲出来，供{targets}参考。",
    "案例需要证据。请展示{name}一项已获授权的服务记录，说明原始需求、采取的动作及结果，并交代适用条件。",
  ],
  成交: [
    "大家最关心的是值不值。{name}的{products}加上{advantages}，以及适用条件，答案其实很简单。",
    "成交的前提是信任。{name}不催单，只把{products}和真实情况讲清楚，剩下的交给{targets}判断。",
    "选择{name}前，可以核对{advantages}，并了解每一步的服务范围。",
  ],
  争议: [
    "有争议很正常，但事实摆在眼前。{name}一直坚持{advantages}，欢迎{targets}亲自来验证。",
    "与其听传言，不如看事实。{name}把{products}和服务过程完整呈现，公道自在人心。",
    "面对争议，最好的回应是把事做好。{name}用{advantages}说话，也愿意接受监督。",
  ],
};

const INTERNAL_HOOKS = {
  同城流量: [
    "做同城流量，最容易忽略的一步，今天讲透。",
    "同城视频先从哪里改？从顾客的问题开始。",
    "同城短视频不是随便发，这几点很多人做反了。",
  ],
  老板人设: [
    "老板为什么要自己出镜？因为人设才是长期获客。",
    "老板人设怎么做才不尬？记住这几个方法。",
    "杰子电商、大城后浪这类账号，赢在人设，今天拆解。",
  ],
  专业知识: [
    "同城内容策划，先检查这三个问题。",
    "同城运营里的专业知识，我们内部这样沉淀。",
    "这节内容讲干货：同城短视频的核心逻辑。",
  ],
  产品: [
    "一款产品怎么讲，顾客才愿意买？拆给你看。",
    "产品内容不是念参数，这套讲法更有效。",
    "拆解一个产品案例，看看爆款是怎么讲的。",
  ],
  案例: [
    "客户诊断案例：问题出在哪，我们怎么改的。",
    "复盘一个真实客户，前后对比一目了然。",
    "学员作业怎么改？把开头、正文和引导逐项检查。",
  ],
  成交: [
    "复盘一个成交案例，关键动作就这几点。",
    "从咨询到成交，中间的承接动作最重要。",
    "成交内容怎么写？我们内部这样定模板。",
  ],
  争议: [
    "做同城最容易踩的争议坑，提前避开。",
    "关于同城运营的一些争议，我们说说真实看法。",
    "争议不可怕，怕的是没人讲清楚边界。",
  ],
};

const INTERNAL_BODIES = {
  同城流量: [
    "同城流量的核心不是拍得漂亮，而是让人停留、产生本地关联。我们内部训练时，会先定好选题和目标受众，再倒推脚本。",
    "一条同城视频要起来，选题、钩子、完播、引导缺一不可。我们把这套方法拆成可复制的步骤，让学员照着练。",
    "同城内容最怕自嗨。我们会先看目标顾客关心什么，再把门店优势翻译成他们听得懂的话。",
  ],
  老板人设: [
    "老板人设的本质是信任资产。让老板本人出镜讲真实观点，比请人拍更有效。我们教老板找话题、说人话、持续更。",
    "面向想做杰子电商/大城后浪类获客内容的运营者，先明确自己的服务对象，再展示真实诊断过程。不要照搬他人的身份、经历或成果。",
    "人设不是包装，是把真实的专业和态度展示出来。我们帮客户梳理人设定位，再配内容节奏。",
  ],
  专业知识: [
    "把专业知识讲给外行听，才算真懂。我们要求每条知识内容都能解决一个具体问题，而不是堆概念。",
    "专业内容要做减法：一个视频只讲一个点，配合案例和对比，观众才记得住。",
    "内部沉淀专业知识，是为了让团队和学员都能复用。我们把常见问题整理成标准答案。",
  ],
  产品: [
    "产品内容要讲顾客听得懂的卖点，而不是参数。我们拆解产品的使用场景、解决的问题和选择理由。",
    "一款产品讲清楚三个点就够了：给谁用、解决什么、为什么选我们。我们内部按这个框架写。",
    "产品内容配合实拍和对比最有说服力。我们教客户把产品放进真实场景里讲。",
  ],
  案例: [
    "诊断案例最能体现专业度。我们拆解客户原来的问题、调整后的动作，以及数据上的变化。",
    "复盘案例要讲方法，也要讲局限。我们让学员看到真实过程，而不是只讲结果。",
    "学员作业里的案例，我们会逐条批改，指出选题、钩子和引导上的问题。",
  ],
  成交: [
    "成交内容是信任的临门一脚。我们复盘从曝光到成交的完整链路，找出卡点和承接动作。",
    "一条成交视频能否奏效，取决于前面的信任积累和结尾引导。我们内部有固定的承接模板。",
    "成交不是硬广。我们把客户真实成交过程整理成可复用的脚本结构。",
  ],
  争议: [
    "面对争议，先讲事实、再讲边界。我们教客户不做夸大承诺，把能承诺和不能承诺的说清楚。",
    "争议内容要克制，避免引战。我们内部有红线清单，确保内容既真实又安全。",
    "有争议说明有关注。我们会把争议转化成一次展示专业和态度的机会。",
  ],
};

const CTAS = {
  曝光: "如果你身边有{targets}，把这条转给TA，让更多人少走弯路。",
  咨询: "有任何问题，欢迎评论区留言，我们看到就会回复。",
  到店: "想了解的朋友，直接来{name}坐坐，地址在主页，欢迎到店。",
  成交: "确认适合自己的需求后，欢迎联系我们了解购买流程和具体服务范围。",
  建立信任: "关注{name}，我会持续分享真实经验，下次见。",
};

const SHOTS = {
  口播: "镜头正对人物，近景或中景；口播为主，字幕强调关键词，结尾停顿两秒。",
  实拍: "实拍门店与{products}，多角度特写，穿插人物出镜讲解，保持画面稳定。",
  采访: "采访顾客或店员，一问一答；现场收音，配环境音，切双机位或正反打。",
  对比: "分屏或前后对比画面，突出{products}与服务差异，关键处加字幕说明。",
  现场讲解: "边走边讲，镜头跟随人物，指向实物细节，注意光线与收音。",
};

function reviewNote(context) {
  const history = (context?.history || []).filter(Boolean).slice(0, 2);
  const reviews = (context?.reviews || []).filter(Boolean).slice(0, 2);
  const parts = [];
  if (history.length)
    parts.push("参考过往内容：「" + history.join("」「") + "」");
  if (reviews.length) parts.push("结合复盘：「" + reviews.join("」「") + "」");
  return parts.join("；").slice(0, 4000);
}

function buildOne(context, cond, index, total) {
  const isInternal = cond.ownership === "我的内容";
  const vars = isInternal ? internalVars(cond) : customerVars(context, cond);
  const hooks = (isInternal ? INTERNAL_HOOKS : CUSTOMER_HOOKS)[
    cond.content_type
  ];
  const bodies = (isInternal ? INTERNAL_BODIES : CUSTOMER_BODIES)[
    cond.content_type
  ];
  const hook = fill(hooks[index % hooks.length], vars);
  let body = fill(
    bodies[Math.floor(index / hooks.length) % bodies.length],
    vars,
  );
  body = `这条内容写给${vars.audience}。\n${body}`;
  const structures = {
    口播: "口播顺序：先提出问题，再说明判断依据，最后给出适用条件。",
    实拍: "实拍顺序：先展示现场，再演示一个细节，最后解释它与顾客需求的关系。",
    采访: "采访提纲：你最关心什么？现场如何处理？有哪些适用条件？回答请按真实情况补充。",
    对比: "对比顺序：在相同条件下展示两种做法，解释差异，不把未经验证的结果当作事实。",
    现场讲解: "现场讲解顺序：指向实物，展示操作，再说明注意事项。",
  };
  body += "\n" + structures[cond.format];
  body += `\n本条目的：${cond.content_goal}；围绕这个目的只讲一个具体问题。`;
  if (isInternal) {
    const themes = [
      "同城短视频培训",
      "客户诊断案例",
      "拍摄现场",
      "文案修改前后对比",
      "学员作业批改",
      "项目复盘",
      "杰子电商/大城后浪类获客内容",
    ];
    body += `\n内部选题：${themes[index % themes.length]}。展示一份真实素材，解释修改理由，再给出可执行的练习。涉及案例和数据时请补充实际证据。`;
  }
  if (!isInternal) {
    const note = reviewNote(context);
    if (note) body += "\n\n创作参考（拍摄前据此调整，不作为口播）：" + note;
  }
  const shots = cond.need_shots
    ? fill(pick(SHOTS[cond.format] ? [SHOTS[cond.format]] : [SHOTS.口播]), vars)
    : "";
  const cta = cond.need_cta ? fill(CTAS[cond.content_goal], vars) : "";
  const subject = isInternal
    ? "内部内容"
    : context?.customer?.title || "本地商家";
  const suffix = total > 1 ? ` · ${index + 1}` : "";
  return {
    title: `${cond.content_type}｜${cond.content_goal}｜${subject}${suffix}`,
    platform: "抖音",
    hook,
    body,
    shots,
    call_to_action: cta,
    publish_date: "",
    ownership: cond.ownership,
    content_type: cond.content_type,
    content_goal: cond.content_goal,
    format: cond.format,
    audience: cond.audience,
    need_shots: cond.need_shots,
    need_cta: cond.need_cta,
    batch_size: total,
  };
}

export function generateScripts(context, cond) {
  // Shuffle candidate angles once per batch, preserving variety within the batch.
  for (const bank of [
    CUSTOMER_HOOKS,
    CUSTOMER_BODIES,
    INTERNAL_HOOKS,
    INTERNAL_BODIES,
  ]) {
    const a = bank[cond.content_type];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
  }
  const total = Math.max(1, Math.min(100, Number(cond.batch_size) || 1));
  return Array.from({ length: total }, (_, i) =>
    buildOne(context, cond, i, total),
  );
}
