
var assert = require('assert');
var _path = require('path')
var _cproc = require('child_process');
var fs = require('fs');
var wtu = require('./workertestutils.js');

createTestDOM();

var emu = require('gen/common/emu.js');
var verilog = require('gen/platform/verilog.js');
var VerilogPlatform = emu.PLATFORMS['verilog'];

Object.assign(global, verilog); // copy global VL_* properties

// TODO: must define $

async function loadPlatform(msg) {
  var platform = new VerilogPlatform();
  platform.resume = function() { }; // prevent resume after reset
  try {
    //console.log(msg.output.ports);
    //console.log(msg.output.signals);
    await platform.loadROM("ROM", msg.output);
    await platform.loadROM("ROM", msg.output);
    for (var i=0; i<100000 && !platform.isBlocked(); i++) {
      platform.tick();
    }
    console.log(i, platform.isBlocked(), platform.isStopped());
    //assert.ok(platform.isBlocked());
    assert.ok(!platform.isStopped());
    var state = platform.saveState();
    platform.reset();
    platform.loadState(state);
    assert.deepEqual(state, platform.saveState());
  } catch (e) {
    //platform.printErrorCodeContext(e, msg.output.code);
    //console.log(msg.intermediate.listing);
    //console.log(msg.output.code);
    console.log(e);
    throw e;
  }
  return platform;
}

function testPerf(msg) {
  var platform = new VerilogPlatform();
  platform.loadROM("ROM", msg.output);
  var niters = 5000000;

  console.time("before");
  for (var i=0; i<niters && !platform.isBlocked(); i++)
    platform.tick();
  console.timeEnd("before");

  var state = platform.saveState();
  platform.reset();
  platform.loadState(state);
  console.time("after");
  for (var i=0; i<niters && !platform.isBlocked(); i++)
    platform.tick();
  console.timeEnd("after");

  return platform;
}

function compileVerilator(filename, code, callback, nerrors, depends) {
    global.postMessage = async function(msg) {
        if (msg.errors && msg.errors.length) {
          console.log(msg.errors);
          assert.equal(nerrors||0, msg.errors.length, "errors");
        } else {
          assert.equal(nerrors||0, 0, "errors");
          await loadPlatform(msg);
          //testPerf(msg);
          if (filename.indexOf('t_') >= 0) {
            //assert.ok(verilog.vl_finished);
          }
        }
        callback(null, msg);
    };
    global.onmessage({
        data:{
          updates:[{path:_path.basename(filename), data:code}],
          buildsteps:[{path:_path.basename(filename), platform:'verilog', tool:'verilator', files:depends}]
        }
    });
}

function testIcarus(filename) {
  _cproc.execSync('iverilog -I./presets/verilog ./' + filename);
}

function testVerilator(filename, disables, nerrors, depends) {
  it('should translate '+filename, function(done) {
    console.log(filename);
    //if (depends) testIcarus(filename);
    var csource = ab2str(fs.readFileSync(filename));
    for (var i=0; i<(disables||[]).length; i++)
      csource = "/* verilator lint_off " + disables[i] + " */ " + csource;
    compileVerilator(filename, csource, done, nerrors||0, depends);
  });
}

describe('Verilog Worker', function() {

  testVerilator('presets/verilog/hvsync_generator.v');
  testVerilator('presets/verilog/digits10.v', null, null, ['digits10.v', 'hvsync_generator.v']);
  testVerilator('presets/verilog/scoreboard.v', null, null, ['scoreboard.v', 'digits10.v', 'hvsync_generator.v']);
  testVerilator('presets/verilog/ball_paddle.v', null, null, ['ball_paddle.v', 'scoreboard.v', 'digits10.v', 'hvsync_generator.v']);
  testVerilator('presets/verilog/sprite_rotation.v', null, null, ['sprite_rotation.v', 'hvsync_generator.v']);
  testVerilator('presets/verilog/lfsr.v');
  testVerilator('presets/verilog/starfield.v', null, null, ['starfield.v', 'lfsr.v', 'hvsync_generator.v']);
  testVerilator('presets/verilog/ram.v');
  testVerilator('presets/verilog/font_cp437_8x8.v');
  testVerilator('presets/verilog/sprite_scanline_renderer.v', null, null, ['sprite_scanline_renderer.v', 'ram.v', 'hvsync_generator.v']);
  testVerilator('presets/verilog/tile_renderer.v', null, null, ['tile_renderer.v', 'font_cp437_8x8.v', 'ram.v', 'hvsync_generator.v']);
  testVerilator('presets/verilog/cpu6502.v');
  // TODO: how to include files? have to pass buildsteps + files

  //testVerilator('test/cli/verilog/t_tri_gate.v');
  testVerilator('test/cli/verilog/t_tri_gen.v', ['UNDRIVEN']);
  testVerilator('test/cli/verilog/t_tri_graph.v', ['UNDRIVEN']);
  testVerilator('test/cli/verilog/t_tri_ifbegin.v', ['UNDRIVEN']);
  testVerilator('test/cli/verilog/t_tri_inout.v');
  testVerilator('test/cli/verilog/t_tri_inout2.v');
  testVerilator('test/cli/verilog/t_tri_pullup.v', ['UNDRIVEN']);
  testVerilator('test/cli/verilog/t_tri_select_unsized.v', ['WIDTH']);
  testVerilator('test/cli/verilog/t_tri_unconn.v', ['PINCONNECTEMPTY']);
  testVerilator('test/cli/verilog/t_tri_various.v', ['UNDRIVEN']);

  testVerilator('test/cli/verilog/t_math_const.v', ['BLKSEQ']);
  testVerilator('test/cli/verilog/t_alw_combdly.v');
  testVerilator('test/cli/verilog/t_clk_first.v', ['UNDRIVEN','SYNCASYNCNET']);
/* TODO: fix tests
  testVerilator('test/cli/verilog/t_clk_gen.v', ['BLKSEQ']);
  testVerilator('test/cli/verilog/t_clk_2in.v', ['BLKSEQ']);
  testVerilator('test/cli/verilog/t_order_doubleloop.v', ['BLKSEQ']);
  testVerilator('test/cli/verilog/t_order_comboclkloop.v');
*/
  testVerilator('test/cli/verilog/t_gen_alw.v');
  testVerilator('test/cli/verilog/t_case_huge_sub3.v');

  //testVerilator('test/cli/verilog/t_order.v');
  //testVerilator('test/cli/verilog/t_order_2d.v');
  //testVerilator('test/cli/verilog/t_order_a.v');
  //testVerilator('test/cli/verilog/t_order_b.v');
  //testVerilator('test/cli/verilog/t_order_clkinst.v');
  //testVerilator('test/cli/verilog/t_order_comboloop.v', ['BLKSEQ']);
  testVerilator('test/cli/verilog/t_order_first.v');
  //testVerilator('test/cli/verilog/t_order_loop_bad.v', ['BLKSEQ'], 10);
  testVerilator('test/cli/verilog/t_order_multialways.v');
  testVerilator('test/cli/verilog/t_order_multidriven.v', ['UNDRIVEN']);
  //testVerilator('test/cli/verilog/t_order_quad.v');
  testVerilator('test/cli/verilog/t_order_wireloop.v', ['UNOPT']);

  testVerilator('test/cli/verilog/t_mem.v');

  testVerilator('test/cli/verilog/t_alw_dly.v', ['BLKSEQ']);
  testVerilator('test/cli/verilog/t_alw_split.v', ['BLKSEQ']);
  testVerilator('test/cli/verilog/t_alw_splitord.v', ['BLKSEQ']);

  testVerilator('test/cli/verilog/t_array_compare.v');

  testVerilator('test/cli/verilog/t_math_arith.v', ['BLKSEQ']);
  //testVerilator('test/cli/verilog/t_math_div.v');
  //testVerilator('test/cli/verilog/t_math_div0.v');

  testVerilator('test/cli/verilog/t_clk_powerdn.v', ['BLKSEQ','SYNCASYNCNET']);
  //testVerilator('test/cli/verilog/t_clk_latchgate.v', ['BLKSEQ']);
  //testVerilator('test/cli/verilog/t_clk_latch.v');
  //testVerilator('test/cli/verilog/t_clk_gater.v', ['BLKSEQ']);
  testVerilator('test/cli/verilog/t_clk_dsp.v');
  testVerilator('test/cli/verilog/t_clk_dpulse.v');
  testVerilator('test/cli/verilog/t_clk_condflop_nord.v');
  testVerilator('test/cli/verilog/t_clk_condflop.v', ['BLKSEQ']);

  /*
  it('should compile verilog example', function(done) {
    var csource = ab2str(fs.readFileSync('presets/verilog/hvsync_generator.v'));
    compileVerilator(csource, done);
  });
  */
});
