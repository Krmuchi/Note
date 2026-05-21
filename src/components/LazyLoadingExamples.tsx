import React, { useState } from 'react';
import { LazyImage } from './LazyImage';
import { PaginatedContent } from './PaginatedContent';
import { VirtualScroll } from './VirtualScroll';
import { createLazyComponent } from '../utils/lazyLoadUtils';

/**
 * 懒加载功能示例组件
 * 展示图片懒加载、分页加载、虚拟滚动和组件懒加载四种懒加载技术
 */
export function LazyLoadingExamples() {
  const [activeTab, setActiveTab] = useState<'image' | 'pagination' | 'virtual' | 'component'>('image');

  // 标签页配置
  const tabs = [
    { id: 'image' as const, label: '图片懒加载' },
    { id: 'pagination' as const, label: '分页加载' },
    { id: 'virtual' as const, label: '虚拟滚动' },
    { id: 'component' as const, label: '组件懒加载' },
  ];

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ marginBottom: '20px', fontSize: '24px', fontWeight: '600' }}>
        懒加载功能示例
      </h1>

      {/* 标签页切换 */}
      <div style={{ marginBottom: '20px', borderBottom: '1px solid #e8e8e8' }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '10px 20px',
              border: 'none',
              background: activeTab === tab.id ? '#2385bb' : 'transparent',
              color: activeTab === tab.id ? '#fff' : '#666',
              cursor: 'pointer',
              fontSize: '14px',
              marginRight: '10px',
              borderRadius: '4px',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 内容区域 */}
      <div style={{ background: '#fff', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
        {activeTab === 'image' && <ImageLazyExample />}
        {activeTab === 'pagination' && <PaginationExample />}
        {activeTab === 'virtual' && <VirtualScrollExample />}
        {activeTab === 'component' && <ComponentLazyExample />}
      </div>
    </div>
  );
}

/**
 * 图片懒加载示例
 */
function ImageLazyExample() {
  const images = [
    'https://picsum.photos/800/600?random=1',
    'https://picsum.photos/800/600?random=2',
    'https://picsum.photos/800/600?random=3',
    'https://picsum.photos/800/600?random=4',
    'https://picsum.photos/800/600?random=5',
  ];

  return (
    <div>
      <h2 style={{ marginBottom: '16px', fontSize: '18px' }}>图片懒加载示例</h2>
      <p style={{ marginBottom: '16px', color: '#666', fontSize: '14px' }}>
        向下滚动查看图片懒加载效果。图片只有在进入视口时才会加载。
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
        {images.map((src, index) => (
          <div key={index} style={{ border: '1px solid #e8e8e8', borderRadius: '8px', overflow: 'hidden' }}>
            <LazyImage
              src={src}
              alt={`示例图片 ${index + 1}`}
              style={{ width: '100%', height: '200px', objectFit: 'cover' }}
              threshold={0.1}
              onLoad={() => console.log(`图片 ${index + 1} 加载完成`)}
            />
            <div style={{ padding: '12px' }}>
              <h3 style={{ margin: '0 0 8px', fontSize: '14px', fontWeight: '600' }}>
                图片 {index + 1}
              </h3>
              <p style={{ margin: 0, fontSize: '12px', color: '#999' }}>
                使用 IntersectionObserver 实现懒加载
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * 分页加载示例
 */
function PaginationExample() {
  // 生成模拟长文档内容
  const longContent = React.useMemo(() => {
    let content = '';
    for (let i = 1; i <= 100; i++) {
      content += `## 第 ${i} 节\n\n`;
      content += `这是第 ${i} 节的内容。在实际应用中，这里可以是文章、文档或其他长文本内容。\n\n`;
      content += `Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.\n\n`;
    }
    return content;
  }, []);

  return (
    <div>
      <h2 style={{ marginBottom: '16px', fontSize: '18px' }}>长文档分页加载示例</h2>
      <p style={{ marginBottom: '16px', color: '#666', fontSize: '14px' }}>
        向下滚动查看分页加载效果。内容会按页逐步加载，避免一次性加载大量内容。
      </p>
      <div style={{ border: '1px solid #e8e8e8', borderRadius: '8px', padding: '20px', maxHeight: '600px', overflow: 'auto' }}>
        <PaginatedContent
          content={longContent}
          pageSize={500}
          className="document-content"
          onLoadMore={(page: number) => console.log('加载第', page, '页')}
          renderContent={(text: string) => (
            <div style={{ lineHeight: '1.8', fontSize: '14px' }}>
              {text.split('\n').map((line: string, index: number) => {
                if (line.startsWith('##')) {
                  return <h3 key={index} style={{ margin: '20px 0 10px', fontSize: '16px', fontWeight: '600' }}>{line.replace('##', '')}</h3>;
                }
                if (line.trim()) {
                  return <p key={index} style={{ margin: '8px 0' }}>{line}</p>;
                }
                return <br key={index} />;
              })}
            </div>
          )}
        />
      </div>
    </div>
  );
}

/**
 * 虚拟滚动示例
 */
function VirtualScrollExample() {
  // 生成 10000 条模拟数据
  const items = React.useMemo(() => {
    return Array.from({ length: 10000 }, (_, i) => ({
      id: `item-${i}`,
      name: `项目 ${i + 1}`,
      description: `这是第 ${i + 1} 个项目的描述信息`,
    }));
  }, []);

  return (
    <div>
      <h2 style={{ marginBottom: '16px', fontSize: '18px' }}>虚拟滚动示例</h2>
      <p style={{ marginBottom: '16px', color: '#666', fontSize: '14px' }}>
        滚动列表查看虚拟滚动效果。只渲染可见区域的元素，大幅提升性能。
      </p>
      <div style={{ border: '1px solid #e8e8e8', borderRadius: '8px', height: '500px' }}>
        <VirtualScroll
          items={items}
          itemHeight={80}
          renderItem={(item: { id: string; name: string; description: string }, index: number) => (
            <div
              key={item.id}
              style={{
                padding: '16px',
                borderBottom: '1px solid #f0f0f0',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
              }}
            >
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                background: '#2385bb',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '14px',
                fontWeight: '600',
              }}>
                {index + 1}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '4px' }}>
                  {item.name}
                </div>
                <div style={{ fontSize: '12px', color: '#999' }}>
                  {item.description}
                </div>
              </div>
            </div>
          )}
        />
      </div>
    </div>
  );
}

/**
 * 组件懒加载示例
 */
function ComponentLazyExample() {
  const [showPanel, setShowPanel] = useState(false);
  const [showModal, setShowModal] = useState(false);

  // 创建懒加载组件
  const LazySharePanel = createLazyComponent(
    () => import('./SharePanel'),
    {
      fallback: <div style={{ padding: '20px', textAlign: 'center', color: '#999' }}>加载分享面板中...</div>,
    }
  ) as unknown as React.ComponentType<Record<string, unknown>>;

  const LazyTagPanel = createLazyComponent(
    () => import('./TagPanel'),
    {
      fallback: <div style={{ padding: '20px', textAlign: 'center', color: '#999' }}>加载标签面板中...</div>,
    }
  ) as unknown as React.ComponentType<Record<string, unknown>>;

  return (
    <div>
      <h2 style={{ marginBottom: '16px', fontSize: '18px' }}>组件懒加载示例</h2>
      <p style={{ marginBottom: '16px', color: '#666', fontSize: '14px' }}>
        点击按钮查看组件懒加载效果。组件只有在需要时才会加载。
      </p>
      
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
        <button
          onClick={() => setShowPanel(!showPanel)}
          style={{
            padding: '10px 20px',
            border: '1px solid #2385bb',
            background: showPanel ? '#2385bb' : '#fff',
            color: showPanel ? '#fff' : '#2385bb',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '14px',
          }}
        >
          {showPanel ? '隐藏' : '显示'}分享面板
        </button>
        
        <button
          onClick={() => setShowModal(!showModal)}
          style={{
            padding: '10px 20px',
            border: '1px solid #2385bb',
            background: showModal ? '#2385bb' : '#fff',
            color: showModal ? '#fff' : '#2385bb',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '14px',
          }}
        >
          {showModal ? '隐藏' : '显示'}标签面板
        </button>
      </div>

      {/* 懒加载分享面板 */}
      {showPanel && (
        <div style={{ border: '1px solid #e8e8e8', borderRadius: '8px', padding: '20px', marginBottom: '16px' }}>
          <h3 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: '600' }}>分享面板（懒加载）</h3>
          <LazySharePanel
            isOpen={true}
            onClose={() => setShowPanel(false)}
            docId="example-doc-id"
            notebookId="example-notebook-id"
            shareSettings={{
              enabled: true,
              defaultPermission: 'view',
              allowPassword: true,
              allowExpiration: true,
            }}
            onGenerateLink={() => {}}
            onDeleteLink={() => {}}
            onCopyLink={() => {}}
          />
        </div>
      )}

      {/* 懒加载标签面板 */}
      {showModal && (
        <div style={{ border: '1px solid #e8e8e8', borderRadius: '8px', padding: '20px' }}>
          <h3 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: '600' }}>标签面板（懒加载）</h3>
          <LazyTagPanel
            isOpen={true}
            onClose={() => setShowModal(false)}
          />
        </div>
      )}
    </div>
  );
}

export default LazyLoadingExamples;