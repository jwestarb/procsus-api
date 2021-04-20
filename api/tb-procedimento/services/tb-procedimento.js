'use strict';

const fs = require('fs')
const readline = require('readline');

const sigtapDir = '/mnt/c/Users/julio.westarb/dev/work/infoSUS/Sigtap'

function Exception(e) {
  return { e, data: e.data && e.data.errors && e.data.errors };
}

function importLayout(fileName) {
  const layout = [];

  let lines = fs
    .readFileSync(`${sigtapDir}/layout/${fileName}_layout.txt`, { encoding:'latin1', flag:'r' })
    .toString()
    .split(/\r?\n/);

  lines.forEach((line) => {

    if (line && !line.startsWith('Coluna')) {
      const reg={};
      reg['campo'] = line.split(',')[0].toLowerCase();
      reg['inicio'] = line.split(',')[2];
      reg['final'] = line.split(',')[3];
      layout.push(reg);
    }
  });

  return layout;
}

async function importarReg(line, layout, entityName) {
  try {
    const reg = {};

    layout.forEach((data) => {
      reg[data.campo] = line.slice(data.inicio-1, data.final).trim();
    });

    await strapi.services[entityName].create(reg);

  } catch (e) {
    console.log("populate", Exception(e));
  }

}

async function importFile(fileName, entityName) {
  console.log(`${fileName}`)
  const fileStream = fs.createReadStream(`${sigtapDir}/${fileName}.txt`, { flags: 'r', encoding: 'latin1' });

  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  const file_layout = await importLayout(fileName);

  for await (const line of rl) {
    await importarReg(line, file_layout, entityName);
  }
}

async function loadFile(fileName) {
  const fileStream = fs.createReadStream(`${sigtapDir}/${fileName}.txt`, { flags: 'r', encoding: 'latin1' });
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });
  const layout = await importLayout(fileName);
  const content = []
  for await (const line of rl) {
    const reg = {};
    layout.forEach((data) => {
      reg[data.campo] = line.slice(data.inicio-1, data.final).trim();
    });
    content.push(reg);
  }
  return content;
}

async function getEntityObj(entityName, keyName) {
  const entityObj = {};
  const allRegs = await strapi.services[entityName].find({'_limit': 999999}, ['id', keyName]);

  allRegs.forEach((data) => {
    entityObj[data[keyName]] = data.id
  });

  return entityObj;
}

async function importRelationProcEntity(tableName, rlEntityName, rlFieldName) {
  console.log(tableName);
  const rlTable = await loadFile(tableName);
  const procs = await getEntityObj('tb-procedimento', 'co_procedimento');
  const rlRegs = await getEntityObj(rlEntityName, rlFieldName);

  const tableData = await Promise.all(
    rlTable.map(async (reg) => {
      const new_reg = {
        ...reg,
        co_procedimento: procs[reg.co_procedimento],
      }
      new_reg[rlFieldName]= rlRegs[reg[rlFieldName]];
      return new_reg;
    })
  );
  const knex = strapi.connections.default;
  await knex.batchInsert(tableName, tableData, 5000);
}

async function importProcedimentos() {
  console.log('tb_procedimento')
  const procedimentos = await loadFile('tb_procedimento');

  const financiamentos = await getEntityObj('tb-financiamento', 'co_financiamento');
  const rubricas = await getEntityObj('tb-rubrica', 'co_rubrica');

  const newProcedimentos = await Promise.all(
    procedimentos.map(async (proc) => {
      return {
        ...proc,
        vl_sh: Number(`${proc.vl_sh.slice(0,8)}.${proc.vl_sh.slice(8,10)}`),
        vl_sa: Number(`${proc.vl_sa.slice(0,8)}.${proc.vl_sa.slice(8,10)}`),
        vl_sp: Number(`${proc.vl_sp.slice(0,8)}.${proc.vl_sp.slice(8,10)}`),
        co_financiamento: financiamentos[proc.co_financiamento],
        co_rubrica: rubricas[proc.rubrica]
      }
    })
  );
  const knex = strapi.connections.default;
  await knex.batchInsert('tb_procedimento', newProcedimentos, 1000);
}

async function importProcedimentoIncremento() {
  console.log('rl_procedimento_incremento')
  const rlProcedimentoIncremento = await loadFile('rl_procedimento_incremento');
  const procs = await getEntityObj('tb-procedimento', 'co_procedimento');
  const habs = await getEntityObj('tb-habilitacao', 'co_habilitacao');

  const tableData = await Promise.all(
    rlProcedimentoIncremento.map(async (reg) => {
      return {
        ...reg,
        co_procedimento: procs[reg.co_procedimento],
        co_habilitacao: habs[reg.co_habilitacao],
        vl_percentual_sh: Number(`${reg.vl_percentual_sh.slice(0,5)}.${reg.vl_percentual_sh.slice(5,7)}`),
        vl_percentual_sa: Number(`${reg.vl_percentual_sa.slice(0,5)}.${reg.vl_percentual_sa.slice(5,7)}`),
        vl_percentual_sp: Number(`${reg.vl_percentual_sp.slice(0,5)}.${reg.vl_percentual_sp.slice(5,7)}`)
      }
    })
  );
  const knex = strapi.connections.default;
  await knex.batchInsert('rl_procedimento_incremento', tableData, 5000);
}

async function importProcedimentoOrigem() {
  console.log('rl_procedimento_origem')
  const rlProcedimentoOrigem = await loadFile('rl_procedimento_origem');
  const procs = await getEntityObj('tb-procedimento', 'co_procedimento');

  const tableData = await Promise.all(
    rlProcedimentoOrigem.map(async (reg) => {
      return {
        ...reg,
        co_procedimento: procs[reg.co_procedimento],
        co_procedimento_origem: procs[reg.co_procedimento_origem]
      }
    })
  );
  const knex = strapi.connections.default;
  await knex.batchInsert('rl_procedimento_origem', tableData, 5000);
}

async function importProcedimentoServico() {
  console.log('rl_procedimento_servico')
  const rlProcedimentoServico = await loadFile('rl_procedimento_servico');
  const procs = await getEntityObj('tb-procedimento', 'co_procedimento');
  const serv = await getEntityObj('tb-servico', 'co_servico');
  const classif = await getEntityObj('tb-servico-classificacao', 'co_classificacao');

  const tableData = await Promise.all(
    rlProcedimentoServico.map(async (reg) => {
      return {
        ...reg,
        co_procedimento: procs[reg.co_procedimento],
        co_servico: serv[reg.co_servico],
        co_classificacao: classif[reg.co_classificacao]
      }
    })
  );
  const knex = strapi.connections.default;
  await knex.batchInsert('rl_procedimento_servico', tableData, 5000);
}

async function importProcedimentoHabilitacao() {
  console.log('rl_procedimento_habilitacao')
  const rlProcedimentoHabilitacao = await loadFile('rl_procedimento_habilitacao');
  const procs = await getEntityObj('tb-procedimento', 'co_procedimento');
  const habs = await getEntityObj('tb-habilitacao', 'co_habilitacao');
  const grupohabs = await getEntityObj('tb-grupo-habilitacao', 'nu_grupo_habilitacao');

  const tableData = await Promise.all(
    rlProcedimentoHabilitacao.map(async (reg) => {
      return {
        ...reg,
        co_procedimento: procs[reg.co_procedimento],
        co_habilitacao: habs[reg.co_habilitacao],
        nu_grupo_habilitacao: grupohabs[reg.nu_grupo_habilitacao]
      }
    })
  );
  const knex = strapi.connections.default;
  await knex.batchInsert('rl_procedimento_habilitacao', tableData, 5000);
}

async function importExcecaoCompatibilidade() {
  console.log('rl_excecao_compatibilidade')
  const rlExcecaoCompatibilidade = await loadFile('rl_excecao_compatibilidade');
  const procs = await getEntityObj('tb-procedimento', 'co_procedimento');
  const registros = await getEntityObj('tb-registro', 'co_registro');

  const tableData = await Promise.all(
    rlExcecaoCompatibilidade.map(async (reg) => {
      return {
        ...reg,
        co_procedimento_restricao: procs[reg.co_procedimento_restricao],
        co_procedimento_principal: procs[reg.co_procedimento_principal],
        co_registro_principal: registros[reg.co_registro_principal],
        co_procedimento_compativel: procs[reg.co_procedimento_compativel],
        co_registro_compativel: registros[reg.co_registro_compativel]
      }
    })
  );
  const knex = strapi.connections.default;
  await knex.batchInsert('rl_excecao_compatibilidade', tableData, 5000);
}

async function importProcedimentoCompativel() {
  console.log('rl_procedimento_compativel')
  const rlExcecaoCompatibilidade = await loadFile('rl_procedimento_compativel');
  const procs = await getEntityObj('tb-procedimento', 'co_procedimento');
  const registros = await getEntityObj('tb-registro', 'co_registro');

  const tableData = await Promise.all(
    rlExcecaoCompatibilidade.map(async (reg) => {
      return {
        ...reg,
        co_procedimento_principal: procs[reg.co_procedimento_principal],
        co_registro_principal: registros[reg.co_registro_principal],
        co_procedimento_compativel: procs[reg.co_procedimento_compativel],
        co_registro_compativel: registros[reg.co_registro_compativel]
      }
    })
  );
  const knex = strapi.connections.default;
  await knex.batchInsert('rl_procedimento_compativel', tableData, 5000);
}

module.exports = {
  populate: async (params) => {
    try {
      console.log("Importando tabelas Sigtap...")
      await importFile('tb_grupo', 'tb-grupo');
      await importFile('tb_sub_grupo', 'tb-sub-grupo');
      await importFile('tb_forma_organizacao', 'tb-forma-organizacao');
      await importFile('tb_cid', 'tb-cid');
      await importFile('tb_componente_rede', 'tb-componente-rede');
      await importFile('tb_descricao', 'tb-descricao');
      await importFile('tb_descricao_detalhe', 'tb-descricao-detalhe');
      await importFile('tb_detalhe', 'tb-detalhe');
      await importFile('tb_financiamento', 'tb-financiamento');
      await importFile('tb_grupo_habilitacao', 'tb-grupo-habilitacao');
      await importFile('tb_habilitacao', 'tb-habilitacao');
      await importFile('tb_modalidade', 'tb-modalidade');
      await importFile('tb_ocupacao', 'tb-ocupacao');
      await importFile('tb_rede_atencao', 'tb-rede-atencao');
      await importFile('tb_registro', 'tb-registro');
      await importFile('tb_regra_condicionada', 'tb-regra-condicionada');
      await importFile('tb_renases', 'tb-renases');
      await importFile('tb_rubrica', 'tb-rubrica');
      await importFile('tb_servico', 'tb-servico');
      await importFile('tb_servico_classificacao', 'tb-servico-classificacao');
      await importFile('tb_sia_sih', 'tb-sia-sih');
      await importFile('tb_tipo_leito', 'tb-tipo-leito');
      await importFile('tb_tuss', 'tb-tuss');
      await importProcedimentos();
      await importRelationProcEntity('rl_procedimento_cid', 'tb-cid', 'co_cid');
      await importRelationProcEntity('rl_procedimento_ocupacao', 'tb-ocupacao', 'co_ocupacao');
      await importRelationProcEntity('rl_procedimento_renases', 'tb-renases', 'co_renases');
      await importRelationProcEntity('rl_procedimento_regra_cond', 'tb-regra-condicionada', 'co_regra_condicionada');
      await importRelationProcEntity('rl_procedimento_registro', 'tb-registro', 'co_registro');
      await importRelationProcEntity('rl_procedimento_modalidade', 'tb-modalidade', 'co_modalidade');
      await importRelationProcEntity('rl_procedimento_comp_rede', 'tb-componente-rede', 'co_componente_rede');
      await importRelationProcEntity('rl_procedimento_detalhe', 'tb-detalhe', 'co_detalhe');
      await importRelationProcEntity('rl_procedimento_leito', 'tb-tipo-leito', 'co_tipo_leito');
      await importRelationProcEntity('rl_procedimento_sia_sih', 'tb-sia-sih', 'co_procedimento_sia_sih');
      await importRelationProcEntity('rl_procedimento_tuss', 'tb-tuss', 'co_tuss');
      await importProcedimentoIncremento();
      await importProcedimentoServico();
      await importProcedimentoOrigem();
      await importProcedimentoHabilitacao();
      await importExcecaoCompatibilidade();
      await importProcedimentoCompativel();
      console.log("Concluido.")
    } catch (e) {
      console.log("populate", Exception(e));
    }
  },
};


