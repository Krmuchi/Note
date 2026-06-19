import type { Template, TemplateCategory } from '@/types/templates';

export const templates: Template[] = [
  {
    id: 'weekly-report',
    name: '周报模板',
    description: '记录一周工作进展和下周计划',
    category: 'work',
    icon: '📊',
    content: `# 周报 - {week}

## 📋 本周完成
- [ ] 任务一
- [ ] 任务二
- [ ] 任务三

## 🎯 下周计划
- [ ] 计划一
- [ ] 计划二

## ⚠️ 风险与问题
- 问题一
- 问题二

## 💡 心得与建议
`,
    tags: ['工作', '周报'],
    usageCount: 156,
    createdAt: '2024-01-15',
  },
  {
    id: 'meeting-minutes',
    name: '会议纪要',
    description: '记录会议内容和决议事项',
    category: 'meeting',
    icon: '📝',
    content: `# {meetingName} 会议纪要

**时间**: {date}
**地点**: {location}
**主持人**: {host}
**参会人员**: 

## 📋 会议议程

### 1. 议题一
- 讨论内容
- 决议事项

### 2. 议题二
- 讨论内容
- 决议事项

## 🎯 行动项
| 任务 | 负责人 | 截止日期 | 状态 |
|------|--------|----------|------|
| 任务一 | 张三 | YYYY-MM-DD | 未开始 |

## 📌 下次会议
**时间**: 
**地点**: 
`,
    tags: ['会议', '记录'],
    usageCount: 89,
    createdAt: '2024-01-10',
  },
  {
    id: 'project-plan',
    name: '项目计划',
    description: '规划项目目标、里程碑和资源',
    category: 'project',
    icon: '🎯',
    content: `# {projectName} 项目计划

## 📋 项目概述
**项目目标**: 
**背景说明**: 

## 🎯 核心目标
- 目标一
- 目标二

## 📅 里程碑
| 阶段 | 时间节点 | 交付物 | 负责人 |
|------|----------|--------|--------|
| 阶段一 | YYYY-MM-DD | 需求文档 | 张三 |
| 阶段二 | YYYY-MM-DD | 设计稿 | 李四 |
| 阶段三 | YYYY-MM-DD | 开发完成 | 王五 |

## 📊 资源需求
- 人力: 
- 预算: 
- 工具: 

## ⚠️ 风险评估
| 风险 | 概率 | 影响 | 应对措施 |
|------|------|------|----------|
`,
    tags: ['项目', '计划'],
    usageCount: 67,
    createdAt: '2024-01-08',
  },
  {
    id: 'daily-note',
    name: '每日笔记',
    description: '记录每日思考和待办事项',
    category: 'personal',
    icon: '📒',
    content: `# {date} 每日笔记

## 🌅 今日心情
- [ ] 开心 😊
- [ ] 平静 😐
- [ ] 疲惫 😩

## ✅ 今日完成
- [ ] 完成事项一
- [ ] 完成事项二

## 📝 待办清单
- [ ] 待办事项一
- [ ] 待办事项二

## 💭 今日思考
- 想法一
- 想法二

## 📚 学习收获
- 学习内容一
- 学习内容二
`,
    tags: ['个人', '日记'],
    usageCount: 234,
    createdAt: '2024-01-05',
  },
  {
    id: 'book-summary',
    name: '读书笔记',
    description: '记录阅读收获和心得',
    category: 'education',
    icon: '📚',
    content: `# 《{bookName}》读书笔记

**作者**: 
**出版社**: 
**阅读时间**: 

## 📖 内容概要
本书主要讲述了...

## 💡 核心观点
1. 观点一
2. 观点二
3. 观点三

## 📝 精彩摘录
> 精彩语句摘录...

## 🔍 我的思考
- 思考一
- 思考二

## 🎯 行动清单
- [ ] 行动一
- [ ] 行动二
`,
    tags: ['阅读', '学习'],
    usageCount: 145,
    createdAt: '2024-01-03',
  },
  {
    id: 'brainstorm',
    name: '头脑风暴',
    description: '收集创意和想法',
    category: 'project',
    icon: '💡',
    content: `# {topic} 头脑风暴

## 🎯 目标
本次头脑风暴的目标是...

## 💡 创意收集
- [ ] 想法一
- [ ] 想法二
- [ ] 想法三
- [ ] 想法四

## 🔝 最佳方案
经过讨论，最佳方案是...

## 📋 下一步行动
- [ ] 行动一
- [ ] 行动二
`,
    tags: ['创意', '协作'],
    usageCount: 78,
    createdAt: '2024-01-02',
  },
  {
    id: 'travel-plan',
    name: '旅行计划',
    description: '规划旅行行程和预算',
    category: 'personal',
    icon: '✈️',
    content: `# {destination} 旅行计划

**旅行时间**: {startDate} - {endDate}
**同行人员**: 

## 📅 行程安排

### Day 1
- 上午: 
- 下午: 
- 晚上: 

### Day 2
- 上午: 
- 下午: 
- 晚上: 

## 🏨 住宿安排
| 日期 | 酒店 | 地址 | 价格 |
|------|------|------|------|

## 💰 预算预估
| 项目 | 金额 |
|------|------|
| 交通 | 
| 住宿 | 
| 餐饮 | 
| 门票 | 
| 总计 | 

## 📝 注意事项
- 注意事项一
- 注意事项二
`,
    tags: ['旅行', '计划'],
    usageCount: 56,
    createdAt: '2024-01-01',
  },
  {
    id: 'interview-prep',
    name: '面试准备',
    description: '整理面试问题和答案',
    category: 'education',
    icon: '💼',
    content: `# {company} 面试准备

**面试岗位**: 
**面试时间**: 
**面试地点**: 

## 📋 公司背景
- 公司简介
- 业务范围
- 企业文化

## ❓ 常见问题
| 问题 | 答案要点 |
|------|----------|
| 自我介绍 | 核心技能、项目经验、职业规划 |
| 职业规划 | 短期目标、长期愿景 |
| 优缺点 | 优点具体事例、改进措施 |

## 📝 准备提问
- 问题一
- 问题二
- 问题三

## 🔗 参考资料
- [资料链接一]()
- [资料链接二]()
`,
    tags: ['面试', '职业'],
    usageCount: 92,
    createdAt: '2023-12-28',
  },
];

export const templateCategories: TemplateCategory[] = [
  {
    id: 'work',
    name: '工作办公',
    icon: '💼',
    templates: templates.filter(t => t.category === 'work'),
  },
  {
    id: 'meeting',
    name: '会议协作',
    icon: '🤝',
    templates: templates.filter(t => t.category === 'meeting'),
  },
  {
    id: 'project',
    name: '项目管理',
    icon: '📁',
    templates: templates.filter(t => t.category === 'project'),
  },
  {
    id: 'personal',
    name: '个人生活',
    icon: '👤',
    templates: templates.filter(t => t.category === 'personal'),
  },
  {
    id: 'education',
    name: '学习教育',
    icon: '📚',
    templates: templates.filter(t => t.category === 'education'),
  },
];

export const getTemplatesByCategory = (categoryId: string): Template[] => {
  return templates.filter(t => t.category === categoryId);
};

export const searchTemplates = (query: string): Template[] => {
  const lowerQuery = query.toLowerCase();
  return templates.filter(
    t => t.name.toLowerCase().includes(lowerQuery) || 
         t.description.toLowerCase().includes(lowerQuery) ||
         t.tags?.some(tag => tag.toLowerCase().includes(lowerQuery))
  );
};

export const getTemplateById = (id: string): Template | undefined => {
  return templates.find(t => t.id === id);
};