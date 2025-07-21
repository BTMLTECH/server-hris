import ejs from 'ejs';
import path from 'path';
import sendMailToUser from './emailSender';


export const sendEmail = async (
  email: string,
  subject: string,
  template: string,
  data: object
): Promise<boolean> => { 
  try {
    const emailContent = await ejs.renderFile(
      path.join(__dirname, `../mail/${template}`), 
      data
    );

    const emailResponse = await sendMailToUser({
      email,
      subject,
      template, 
      data, 
    })
    if (emailResponse.accepted.length > 0) {

      return true;  
    } else {
      return false; 
    }
  } catch (error) {
    return false; 
  }
};




