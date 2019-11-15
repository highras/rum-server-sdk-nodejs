'use strict'

class RUMConfig {
	static get VERSION() {
		return '1.0.0';
	}

	static get RECONN_COUNT_ONCE() {
		//一次重新连接流程中的尝试次数
		return 1;
	}

	static get CONNCT_INTERVAL() {
		//尝试重新连接的时间间隔(ms)
		return 1 * 1000;
	}
}