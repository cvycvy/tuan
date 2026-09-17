export default defineAppConfig({
  pages: [
    'pages/index/index',
    'pages/report/index',
    'pages/orders/index',
    'pages/order-detail/index',
    'pages/worker/index',
    'pages/powder/index',
    'pages/powder-orders/index'
  ],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#ec4899',
    navigationBarTitleText: '烘焙协助',
    navigationBarTextStyle: 'white'
  },
  tabBar: {
    color: '#6b7280',
    selectedColor: '#ec4899',
    backgroundColor: '#ffffff',
    borderStyle: 'black',
    list: [
      {
        pagePath: 'pages/index/index',
        text: '首页'
      },
      {
        pagePath: 'pages/orders/index',
        text: '我的协助'
      },
      {
        pagePath: 'pages/worker/index',
        text: '烘焙师接单'
      }
    ]
  },
  permission: {
    'scope.userLocation': {
      desc: '你的位置信息将用于就近匹配烘焙师'
    }
  },
  requiredPrivateInfos: ['getLocation', 'chooseLocation']
})
