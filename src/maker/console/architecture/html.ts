export const architectureBody = String.raw`

    <div class="section-head"><p id="load-status" role="status">正在读取已保存架构图…</p></div>
    <div class="workspace" hidden>

      <main>
        <div class="intro">
          <div>
            <p class="eyebrow">项目检查 / 项目架构图</p>
            <h1 id="name"></h1>
            <p id="summary"></p>
            <div id="identity"></div>
          </div>
          <button id="export">导出本项目 JSON ↓</button>
        </div>
        <div class="stats" id="stats"></div>
        <div class="insight">
          <span>阅读提示</span>
          <p id="insight"></p>
        </div>
        <section id="structure">
          <div class="section-head">
            <div>
              <h2>先看模块，再看引用</h2>
              <p id="map-hint">点一个模块，突出它与其它模块的引用关系。</p>
            </div>
            <button id="tour">逐个讲解</button>
          </div>
          <div class="graph-layout">
            <div>
              <div class="map" id="map">
                <svg id="wires" aria-hidden="true"></svg>
                <div id="nodes" class="nodes"></div>
              </div>
              <div class="legend">
                <span>→ A 引用 B：A 的源码加载 B</span

                ><span>不代表真实运行顺序</span>
              </div>
              <div id="relationships" class="relationships"></div>
            </div>
            <section
              class="inspector"
              id="inspector"
              aria-live="polite"
            ></section>
          </div>
          <div class="entry-box">
            <h3>实际启动入口</h3>
            <div id="entries"></div>
          </div>
        </section>
        <footer id="footer"></footer>
      </main>
    </div>

    <div id="toast" role="status"></div>



`;
