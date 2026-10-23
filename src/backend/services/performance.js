// Performance reviews: quarterly evaluation sheets with dimensions, comments
// and next-quarter expectations. The Q3 2026 template is taken from
// assets/徐炯-青牛智胜2026年Q3个人绩效考核评价表.xlsx.

import { getDb, newId, now } from '../db.js';

const MAX_DIMENSIONS = 12;
const MAX_ITEMS = 20;
const SEED_META_KEY = 'performanceSeedV1';

const TEMPLATES = [
  {
    id: 'q3-2026',
    label: '2026 Q3 · 徐炯',
    title: '青牛智胜2026年Q3个人绩效考核评价表',
    employeeName: '徐炯',
    period: '2026 Q3',
    grade: 'B',
    dimensions: [
      {
        name: '工作完成度',
        items: [
          {
            comment: '主导完成文创小程序 AIGC、情景式游戏、数字明信片、科普答题等创新型玩法设计与开发，并完成科技馆打卡大版本改造，覆盖 AR 功能、分支回答与流程追问、路线指引、团购及界面交互优化，助力产品体验与业务转化提升。',
            expectation: '持续跟进陪伴式导览、支付宝及微信小程序导览后续版本迭代，聚焦交互体验升级与性能深度优化，保持高迭代效率，打造高竞争力产品。',
          },
          {
            comment: '从 0 到 1 完成川大博物馆微信小程序票务核销系统开发；在微信小程序中完整复刻支付宝导览与绑卡逻辑，并重构支付宝订单与绑卡逻辑，推动支付宝小程序多个版本持续优化；累计完成导览 20+ 版本迭代，平均每周一个以上迭代，工作量与交付效率均处于高位。',
            expectation: '智能客服平台后续迭代任务，持续完善全平台多语言能力，严格把控交付质量与节点，保障项目稳定运行。',
          },
          {
            comment: '完成埋点系统与 SDK 设计开发，统筹三端数百个业务埋点上报的设计与实现；主导导览机上线前地图与蓝牙信标优化及现场测试，持续打磨交互与使用体验；完成中铁建项目 14 个需求开发与缺陷修复；实现智能客服全平台多语言改造推动，完成九龙巴士版本上线。',
            expectation: '同步跟进其他新增项目前端开发，做好多项目并行的进度管控与日常维护，确保各项目关键节点稳定交付。',
          },
        ],
      },
      {
        name: '团队配合',
        items: [
          {
            comment: '主动推进需求全流程，精细化完成接口对接、需求评审等全链路沟通，主动承担自测与联调任务，大幅降低联调阶段问题率。',
            expectation: '严守个人开发进度与质量标准，主动牵头推进多项目需求全流程，保障团队整体交付效率。',
          },
          {
            comment: '积极主动分担团队开发任务，协助同事消化版本需求，保障团队整体迭代效率。',
            expectation: '深入钻研各项目核心业务逻辑，提升需求理解精准度，减少跨岗位沟通成本，赋能团队协作提效。',
          },
          {
            comment: '开发中主动研判需求合理性与交互体验，推动产品需求优化；及时响应业务与客户反馈，高效落地需求迭代，营造包容协作的团队氛围。',
            expectation: '保持问题快速响应机制，持续优化需求合理性与交互体验，打造易用性更强的系统；主动分享技术攻坚经验，助力团队攻克技术与业务难点。',
          },
        ],
      },
      {
        name: '个人成长及工作态度',
        items: [
          {
            comment: '熟练运用 AI 工具赋能开发，覆盖 90% 以上日常开发任务，显著提升开发效率，保障多项目按期交付。',
            expectation: '在提升开发效率的基础上，聚焦项目架构优化与交互性能提升，强化代码稳定性与可扩展性，支撑项目长期稳定运行与快速迭代。',
          },
          {
            comment: '深度钻研导览、智能客服等系统业务逻辑与技术架构，拓展多端开发、跨端适配、埋点体系等前沿领域技术实践经验，实现技术应用与业务理解能力同步提升。',
            expectation: '强化项目经验沉淀，分类梳理多业务场景下的技术方案、难点攻克思路与踩坑复盘，形成标准化文档便于复用；主动追踪前端新技术与热门框架动态，开展系统性学习。',
          },
          {
            comment: '始终保持积极进取的工作态度，以创新思维优化开发方案；工作规划清晰、高质量、准时完成各项任务，并持续复盘总结高效实现路径。',
            expectation: '延续创新精神与批判性思维，保持积极进取的工作状态，持续探索更高效的开发模式与团队协作方法，保障多项目需求高质量落地，为团队规模化发展赋能。',
          },
        ],
      },
    ],
  },
];

function text(value, field, max, options = {}) {
  const required = Boolean(options.required);
  const fallback = options.fallback === undefined ? '' : options.fallback;
  if (value === undefined || value === null) {
    if (required) throw new Error(`${field}不能为空。`);
    return fallback;
  }
  const out = String(value).replace(/\r\n/g, '\n').trim();
  if (required && !out) throw new Error(`${field}不能为空。`);
  if (out.length > max) throw new Error(`${field}太长，最多 ${max} 个字。`);
  return out;
}

function statusOf(value, fallback = 'draft') {
  if (value === undefined || value === null || value === '') return fallback;
  if (value !== 'draft' && value !== 'final') throw new Error('绩效状态只能是草稿或已定稿。');
  return value;
}

function normaliseDimensions(input) {
  if (!Array.isArray(input) || !input.length) {
    throw new Error('至少需要一个考核维度。');
  }
  if (input.length > MAX_DIMENSIONS) {
    throw new Error(`考核维度最多 ${MAX_DIMENSIONS} 个。`);
  }
  return input.map((dimension, dIndex) => {
    if (!dimension || typeof dimension !== 'object') {
      throw new Error(`第 ${dIndex + 1} 个考核维度格式不对。`);
    }
    const name = text(dimension.name, `第 ${dIndex + 1} 个考核维度名称`, 60, { required: true });
    const rows = Array.isArray(dimension.items) ? dimension.items : [];
    if (rows.length > MAX_ITEMS) {
      throw new Error(`「${name}」最多 ${MAX_ITEMS} 条内容。`);
    }
    const items = [];
    rows.forEach((item, iIndex) => {
      if (!item || typeof item !== 'object') {
        throw new Error(`「${name}」第 ${iIndex + 1} 条内容格式不对。`);
      }
      const comment = text(item.comment, `「${name}」第 ${iIndex + 1} 条评语`, 4000);
      const expectation = text(item.expectation, `「${name}」第 ${iIndex + 1} 条期望`, 4000);
      items.push({ comment, expectation });
    });
    if (!items.length) throw new Error(`「${name}」至少需要一行内容。`);
    return { name, items };
  });
}

function templateById(id) {
  return TEMPLATES.find((item) => item.id === id) || null;
}

function publicTemplates() {
  return TEMPLATES.map((item) => ({
    id: item.id,
    label: item.label,
    title: item.title,
    employeeName: item.employeeName,
    period: item.period,
    grade: item.grade,
    dimensionCount: item.dimensions.length,
    itemCount: item.dimensions.reduce((sum, dimension) => sum + dimension.items.length, 0),
  }));
}

function safeFilePart(value) {
  return String(value || '')
    .replace(/[\\/:*?"<>|\n\r]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
}

function mapReview(row) {
  return {
    id: row.id,
    title: row.title,
    employeeName: row.employee_name,
    period: row.period,
    grade: row.grade,
    status: row.status,
    managerSignature: row.manager_signature,
    employeeSignature: row.employee_signature,
    source: row.source,
    dimensionCount: Number(row.dimension_count || 0),
    itemCount: Number(row.item_count || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at || null,
  };
}

function findReviewRow(id, includeDeleted = false) {
  if (typeof id !== 'string' || !id) throw new Error('没有指定要打开的绩效评价表。');
  const row = getDb().prepare(
    `SELECT r.*,
            (SELECT COUNT(*) FROM performance_dimensions d WHERE d.review_id = r.id) AS dimension_count,
            (SELECT COUNT(*) FROM performance_items i
               JOIN performance_dimensions d ON d.id = i.dimension_id
              WHERE d.review_id = r.id) AS item_count
       FROM performance_reviews r
      WHERE r.id = ?${includeDeleted ? '' : ' AND r.deleted_at IS NULL'}`
  ).all(id)[0];
  if (!row) throw new Error('这张绩效评价表不存在，可能已经被删除了。');
  return row;
}

function dimensionsOf(reviewId) {
  const db = getDb();
  const dimensions = db.prepare(
    'SELECT * FROM performance_dimensions WHERE review_id = ? ORDER BY sort_order ASC, created_at ASC'
  ).all(reviewId);
  return dimensions.map((dimension) => ({
    id: dimension.id,
    name: dimension.name,
    items: db.prepare(
      'SELECT * FROM performance_items WHERE dimension_id = ? ORDER BY sort_order ASC, created_at ASC'
    ).all(dimension.id).map((item) => ({
      id: item.id,
      comment: item.comment,
      expectation: item.expectation,
    })),
  }));
}

function insertDimensions(reviewId, dimensions) {
  const db = getDb();
  const stamp = now();
  const insertDimension = db.prepare(
    `INSERT INTO performance_dimensions
       (id, review_id, name, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  const insertItem = db.prepare(
    `INSERT INTO performance_items
       (id, dimension_id, comment, expectation, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  dimensions.forEach((dimension, dIndex) => {
    const dimensionId = newId('pd_');
    insertDimension.run(dimensionId, reviewId, dimension.name, dIndex, stamp, stamp);
    dimension.items.forEach((item, iIndex) => {
      insertItem.run(newId('pi_'), dimensionId, item.comment, item.expectation, iIndex, stamp, stamp);
    });
  });
}

function insertReviewRow(meta, dimensions) {
  const db = getDb();
  const id = newId('perf_');
  const stamp = now();
  db.prepare(
    `INSERT INTO performance_reviews
       (id, title, employee_name, period, grade, status,
        manager_signature, employee_signature, source, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`
  ).run(
    id,
    meta.title,
    meta.employeeName,
    meta.period,
    meta.grade,
    meta.status,
    meta.managerSignature,
    meta.employeeSignature,
    meta.source,
    stamp,
    stamp
  );
  insertDimensions(id, dimensions);
  return id;
}

export function listPerformance() {
  const rows = getDb().prepare(
    `SELECT r.*,
            (SELECT COUNT(*) FROM performance_dimensions d WHERE d.review_id = r.id) AS dimension_count,
            (SELECT COUNT(*) FROM performance_items i
               JOIN performance_dimensions d ON d.id = i.dimension_id
              WHERE d.review_id = r.id) AS item_count
       FROM performance_reviews r
      WHERE r.deleted_at IS NULL
      ORDER BY r.updated_at DESC, r.created_at DESC`
  ).all();
  return {
    items: rows.map(mapReview),
    total: rows.length,
    templates: publicTemplates(),
  };
}

export function getPerformance(params = {}) {
  const row = findReviewRow(params.id);
  return {
    ...mapReview(row),
    dimensions: dimensionsOf(row.id),
  };
}

export function createPerformance(params = {}) {
  const template = params.template ? templateById(params.template) : null;
  if (params.template && !template) throw new Error('没有找到这个绩效模板。');
  const dimensions = normaliseDimensions(
    params.dimensions !== undefined ? params.dimensions : (template ? template.dimensions : [])
  );
  const meta = {
    title: text(
      params.title !== undefined ? params.title : (template ? template.title : ''),
      '评价表标题',
      120,
      { required: true }
    ),
    employeeName: text(
      params.employeeName !== undefined ? params.employeeName : (template ? template.employeeName : ''),
      '员工姓名',
      40,
      { required: true }
    ),
    period: text(
      params.period !== undefined ? params.period : (template ? template.period : ''),
      '考核周期',
      30,
      { required: true }
    ),
    grade: text(
      params.grade !== undefined ? params.grade : (template ? template.grade : ''),
      '考核评级',
      12
    ),
    status: statusOf(params.status, 'draft'),
    managerSignature: text(params.managerSignature, '直接上级签字', 80),
    employeeSignature: text(params.employeeSignature, '员工确认签字', 80),
    source: text(params.source, '来源', 80, { fallback: template ? `template:${template.id}` : 'manual' }),
  };

  const db = getDb();
  let id = null;
  const run = db.transaction(() => {
    id = insertReviewRow(meta, dimensions);
  });
  run();
  return getPerformance({ id });
}

export function savePerformance(params = {}) {
  const row = findReviewRow(params.id);
  const db = getDb();
  const patch = {};

  if (params.title !== undefined) patch.title = text(params.title, '评价表标题', 120, { required: true });
  if (params.employeeName !== undefined) patch.employee_name = text(params.employeeName, '员工姓名', 40, { required: true });
  if (params.period !== undefined) patch.period = text(params.period, '考核周期', 30, { required: true });
  if (params.grade !== undefined) patch.grade = text(params.grade, '考核评级', 12);
  if (params.status !== undefined) patch.status = statusOf(params.status);
  if (params.managerSignature !== undefined) {
    patch.manager_signature = text(params.managerSignature, '直接上级签字', 80);
  }
  if (params.employeeSignature !== undefined) {
    patch.employee_signature = text(params.employeeSignature, '员工确认签字', 80);
  }

  const dimensions = params.dimensions !== undefined
    ? normaliseDimensions(params.dimensions)
    : null;

  const stamp = now();
  const run = db.transaction(() => {
    const columns = Object.keys(patch);
    if (columns.length) {
      db.prepare(
        `UPDATE performance_reviews SET ${columns.map((column) => `${column} = ?`).join(', ')}, updated_at = ?
          WHERE id = ?`
      ).run(...columns.map((column) => patch[column]), stamp, row.id);
    } else {
      db.prepare('UPDATE performance_reviews SET updated_at = ? WHERE id = ?').run(stamp, row.id);
    }

    if (dimensions) {
      db.prepare(
        `DELETE FROM performance_items
          WHERE dimension_id IN (SELECT id FROM performance_dimensions WHERE review_id = ?)`
      ).run(row.id);
      db.prepare('DELETE FROM performance_dimensions WHERE review_id = ?').run(row.id);
      insertDimensions(row.id, dimensions);
    }
  });
  run();
  return getPerformance({ id: row.id });
}

export function removePerformance(params = {}) {
  const row = findReviewRow(params.id);
  const stamp = now();
  getDb().prepare('UPDATE performance_reviews SET deleted_at = ?, updated_at = ? WHERE id = ?')
    .run(stamp, stamp, row.id);
  return { id: row.id, deletedAt: stamp };
}

export function restorePerformance(params = {}) {
  const row = findReviewRow(params.id, true);
  getDb().prepare('UPDATE performance_reviews SET deleted_at = NULL, updated_at = ? WHERE id = ?')
    .run(now(), row.id);
  return getPerformance({ id: row.id });
}

export function performanceMarkdown(params = {}) {
  const review = getPerformance({ id: params.id });
  const lines = [`# ${review.title}`, ''];
  lines.push(`- 员工姓名：${review.employeeName || '—'}`);
  lines.push(`- 考核周期：${review.period || '—'}`);
  lines.push(`- 本次考核评级结果：${review.grade || '—'}`);
  lines.push(`- 状态：${review.status === 'final' ? '已定稿' : '草稿'}`, '');

  for (const dimension of review.dimensions) {
    lines.push(`## ${dimension.name}`, '');
    lines.push('### 评语', '');
    dimension.items.forEach((item, index) => {
      lines.push(`${index + 1}. ${item.comment || '—'}`);
    });
    lines.push('', '### 下季度期望及要求', '');
    dimension.items.forEach((item, index) => {
      lines.push(`${index + 1}. ${item.expectation || '—'}`);
    });
    lines.push('');
  }

  lines.push('---', '');
  lines.push(`直接上级审批签字：${review.managerSignature || '________________'}`);
  lines.push(`员工确认签字：${review.employeeSignature || '________________'}`);
  const markdown = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
  return {
    id: review.id,
    title: review.title,
    filename: `${safeFilePart(review.period) || '绩效评价'}-${safeFilePart(review.employeeName) || '员工'}-绩效评价.md`,
    markdown,
  };
}

export async function exportPerformance(params = {}) {
  const path = typeof params.path === 'string' ? params.path.trim() : '';
  if (!path) throw new Error('没有选择保存位置。');
  const markdown = typeof params.markdown === 'string'
    ? params.markdown
    : performanceMarkdown({ id: params.id }).markdown;
  if (!markdown.trim()) throw new Error('评价表还是空的，先写一点内容吧。');
  await tjs.writeFile(path, markdown);
  const info = await tjs.stat(path);
  return { path, size: info.size, at: Date.now() };
}

/**
 * Create the Q3 2026 review once for existing users. The marker stays even if
 * the user deletes the review, so it never comes back unexpectedly.
 */
export function ensurePerformanceSeed() {
  const db = getDb();
  const marked = db.prepare('SELECT value FROM meta WHERE key = ?').all(SEED_META_KEY)[0];
  if (marked) return { created: false };
  const existing = db.prepare('SELECT id FROM performance_reviews LIMIT 1').all()[0];
  let created = false;
  if (!existing) {
    createPerformance({ template: 'q3-2026', source: 'template:q3-2026' });
    created = true;
  }
  db.prepare(
    `INSERT INTO meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(SEED_META_KEY, String(created ? 1 : 0));
  return { created };
}
