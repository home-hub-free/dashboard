import './style.css'
import { Bind } from 'bindrjs';

new Bind({
  id: 'app',
  bind: {
    test: 'Hello world'
  }
});
