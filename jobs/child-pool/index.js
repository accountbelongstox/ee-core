const EventEmitter = require('events');
const ForkProcess = require('./forkProcess');
const LoadBalancer = require('../load-balancer');
const Loader = require('../../loader');
const Helper = require('../../utils/helper');
const UtilsIs = require('../../utils/is');
const Log = require('../../log');

class ChildPoolJob extends EventEmitter {

  constructor() {
    super();
    this.pidMap = new Map();
    this.connectionsMap={};
    this.connectionsTimer = null;
    this.children = {};
    this.childrenArr = [];
    this.childIndex = 0;
    this.min = 3;
    this.max = 6;
    this.strategy = 'polling';
    this.weights = new Array(this.max).fill().map((v, i) => {
      //(UtilsIs.validValue(weights[i]) ? weights[i] : 1)
      return 1;
    });
  }

  /**
   * 创建一个池子
   */  
  create(number = 3) {
    let pids = [];
    // 最大限制
    let currentNumber = this.childs.length;
    if (number + currentNumber > this.max) {
      number = this.max - currentNumber;
    }

    // 预留
    let options = {};
    let subProcess;
    for (let i = 1; i <= number; i++) {
      subProcess = new ForkProcess(this, options);
      this._childCreated(subProcess);
      pids.push(subProcess.pid);
    }
  
    return pids;
  }

  /**
   * 子进程创建后处理
   */  
  _childCreated(subProcess) {
    let pid = subProcess.pid;
    this.children[pid] = subProcess;
    const length = Object.keys(this.children).length;
    console.log('length:', length);

    // this.LB.add({
    //   id: subProcess.pid,
    //   weight: this.weights[length - 1],
    // });
    // this.lifecycle.watch([pid]);
  }

  /**
   * 执行一个job文件
   */  
  exec(filepath, params = {}, opt = {}) {
    const jobPath = Loader.getFullpath(filepath);
    const boundId = opt.boundId || null;

    // 消息对象
    const mid = Helper.getRandomString();
    const msg = {
      mid,
      jobPath,
      jobParams: params
    }

    let subProcess;
    // 进程绑定ID，该进程只处理此ID类型的任务。
    const boundPid = this.pidMap.get(boundId);
    if (boundPid) {
      subProcess = this.children[boundPid];
    } else {
      // 小于最小值，则创建
      const currentPids = Object.keys(this.children);
      const processNumber = currentPids.length;
      if (processNumber < this.min) {
        const addNumber = this.min - processNumber;
        this.create(addNumber);
      }
      // 从池子中获取一个
      //let lbPid = this.LB.pickOne().id;
      let onePid = currentPids[0];
      subProcess = this.children[onePid];

      // 进程绑定ID，保留一个默认值
      if (boundId && boundId !== 'default') {
        this.pidMap.set(boundId, subProcess.pid);
      }
    }

    if (!subProcess) {
      Log.coreLogger.error(`[ee-core] [jobs/child-pool] No child-process are available !`);
      return;
    }

    // 发消息到子进程
    subProcess.child.send(msg);

    return subProcess;
  }

}

module.exports = ChildPoolJob;
