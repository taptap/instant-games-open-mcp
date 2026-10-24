export const modelSettingsScript = String.raw`
async function renderVisionSettings() {
  if ($('ui-vision-settings')) return;
  const epoch = viewEpoch;
  const panel = node('section',undefined,'card');
  panel.id = 'ui-vision-settings';
  panel.append(node('h2','模型设置'));
  replace($('view'),[panel]);
  const status = node('p','','muted');
  const field = (title,input) => { const label = node('label',undefined,'model-setting-field'); label.append(node('span',title),input); return label; };
  try {
    const settingsUrl = '/api/settings/models' + (selected ? '?project=' + encodeURIComponent(selected) : '');
    let settings = await api(settingsUrl);
    if (page !== 'settings' || epoch !== viewEpoch) return;
    const body = node('div');
    panel.append(body,status);
    const save = async input => {
      settings = await api(settingsUrl,{method:'PUT',body:input});
      status.textContent = '';
    };
    const editProfile = (profile,kind) => {
      const dialog = node('dialog',undefined,'model-api-dialog');
      dialog.setAttribute('aria-label',profile ? '编辑 API' : '新增 API');
      const form = node('form');
      const title = node('h2',profile ? '编辑 API' : '新增 API');
      const name = node('input'); name.value = profile?.name || ''; name.maxLength = 80; name.required = true; name.placeholder = '例如 GPT';
      const base = node('input'); base.value = profile?.baseUrl || ''; base.type = 'url'; base.required = true; base.placeholder = 'https://api.example.com/v1';
      const key = node('input'); key.type = 'password'; key.autocomplete = 'new-password'; key.maxLength = 4096; key.required = !profile; key.placeholder = profile ? '已保存，留空不修改' : 'API Key';
      const model = node('input'); model.value = profile?.model || ''; model.maxLength = 120; model.required = true; model.placeholder = '填写模型 ID';
      const error = node('p','','bad');
      const actions = node('div',undefined,'actions model-api-actions');
      const submit = button('保存',()=>{},{className:'primary'}); submit.type = 'submit';
      const cancel = button('取消',()=>dialog.close());
      let busy = false;
      dialog.addEventListener('cancel',event=>{ if(busy) event.preventDefault(); });
      dialog.addEventListener('close',()=>{ key.value = ''; dialog.remove(); });
      actions.append(cancel,submit);
      if(profile) actions.prepend(button('删除',async()=>{
        if(!window.confirm('删除 API 配置「'+profile.name+'」？')) return;
        busy = true; Array.from(form.elements).forEach(item=>item.disabled=true);
        try { await save({action:'delete-profile',id:profile.id}); dialog.close(); renderChoices(); }
        catch(failure) { error.textContent = failure.message; }
        finally { busy=false; Array.from(form.elements).forEach(item=>item.disabled=false); }
      },{className:'model-api-delete'}));
      const modelHint = node('p','填写服务商提供的准确模型 ID。API Key 本身不能确定模型名称；画布会使用此配置中的模型。','muted');
      form.append(title,field('名称',name),field('Base URL',base),field('API Key',key),field('模型名称',model),modelHint,error,actions);
      form.onsubmit = async event => {
        event.preventDefault(); if(busy) return;
        busy=true; Array.from(form.elements).forEach(item=>item.disabled=true);
        try {
          await save({action:'save-profile',...(profile ? {id:profile.id} : {}),name:name.value.trim(),baseUrl:base.value.trim(),apiKey:key.value,model:model.value.trim()});
          key.value = '';
          const saved = profile || settings.profiles.find(item=>item.name===name.value.trim());
          if(!profile && saved) await save({action:'select',kind,source:'custom',profileId:saved.id});
          dialog.close(); renderChoices();
        } catch(failure) { error.textContent = failure.message; }
        finally { busy=false; Array.from(form.elements).forEach(item=>item.disabled=false); }
      };
      dialog.append(form); document.body.append(dialog); dialog.showModal(); name.focus();
    };
    const renderChoices = () => {
      body.replaceChildren();
      for(const kind of ['vision','generation']) {
        const selection = settings[kind];
        const section = node('div',undefined,'model-settings-choice');
        const source = node('select');
        const choices = kind==='vision' ? [/* Retired vision choices: ['local','本地模型（仅限 CLI 调用）'], ['chatgpt-web','ChatGPT 网页识图'] */ ['server',selection.serverAvailable ? 'Server API' : 'Server API（暂不可用）'],['custom','自定义 API']] : [['maker','Maker MCP 生图'],['local','本地模型（仅限 CLI 调用）'],['custom','自定义 API']];
        choices.forEach(([value,label])=>{const option=node('option',label);option.value=value;option.disabled=kind==='vision' && value==='server' && !selection.serverAvailable;source.append(option);});
        source.value=selection.source;
        const custom=node('div',undefined,'actions model-settings-custom');
        const profiles=node('select'); profiles.setAttribute('aria-label',(kind==='vision'?'识图':'生图')+' API 配置');
        const empty=node('option','选择已保存的 API'); empty.value=''; profiles.append(empty);
        settings.profiles.forEach(profile=>{const option=node('option',profile.name+' · '+profile.model);option.value=profile.id;profiles.append(option);});
        profiles.value=selection.profileId || '';
        const add=button('新增',()=>editProfile(null,kind));
        const edit=button('编辑',()=>{ const profile=settings.profiles.find(item=>item.id===profiles.value); if(profile) editProfile(profile,kind); });
        const sync=()=>{custom.hidden=source.value!=='custom';edit.disabled=!profiles.value;};
        const select = async () => {
          sync(); if(source.value==='custom' && !profiles.value) return;
          source.disabled=profiles.disabled=add.disabled=edit.disabled=true;
          try { await save({action:'select',kind,source:source.value,profileId:profiles.value}); renderChoices(); }
          catch(failure) { status.className='bad';status.textContent=failure.message; source.value=selection.source;profiles.value=selection.profileId || ''; }
          finally {source.disabled=profiles.disabled=add.disabled=false;sync();}
        };
        source.onchange=select; profiles.onchange=select;
        custom.append(profiles,add,edit);
        section.append(field(kind==='vision'?'识图方式':'生图方式',source),custom);
        if(kind==='generation') section.append(node('p',selection.source==='maker' ? '画布模型选项来自 Maker MCP，自动选项使用服务默认模型。' : selection.source==='custom' ? '画布使用所选 API 配置中的模型；修改配置后重新打开图片参数即可刷新。' : '由当前 AI 客户端生成后导入画布。','muted'));
        if(kind==='vision' && selection.selectedSource==='server' && !selection.serverAvailable) section.append(node('p','当前项目的 Server API 暂不可用，请恢复接口或选择自定义 API；不会切换到本地 AI 或网页识图。','muted'));
        // Retired website guidance, retained but not rendered.
        // if(kind==='vision' && selection.source==='chatgpt-web') section.append(node('p','由当前 AI 使用已有浏览器完成 ChatGPT 网页识图，无需安装执行器。登录可选：未登录时可选择直接识图，或登录后识图；未登录无法选择模型，识别质量和 Bbox 准确度可能有偏差。已登录则沿用当前模型和思考程度。图片会上传至 ChatGPT，受网页额度限制。','muted'));
        body.append(section);sync();
      }
    };
    renderChoices();
  } catch(error) { status.className='bad';status.textContent=error.message;panel.append(status); }
}
`;
